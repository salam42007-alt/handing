// =========================================================
//  NEUROHAND v2.1 — script.js
//  - Fixed gesture detection (stability buffer)
//  - Live tab: real-time tracking
//  - Challenge tab: gesture sequence challenge system
// =========================================================

// ── Landmark Indices ──────────────────────────────────────
const LM = {
  WRIST:0,
  THUMB_CMC:1,THUMB_MCP:2,THUMB_IP:3,THUMB_TIP:4,
  INDEX_MCP:5,INDEX_PIP:6,INDEX_DIP:7,INDEX_TIP:8,
  MIDDLE_MCP:9,MIDDLE_PIP:10,MIDDLE_DIP:11,MIDDLE_TIP:12,
  RING_MCP:13,RING_PIP:14,RING_DIP:15,RING_TIP:16,
  PINKY_MCP:17,PINKY_PIP:18,PINKY_DIP:19,PINKY_TIP:20,
};

// ── Gesture color palette ─────────────────────────────────
const GESTURE_COLORS = {
  thumb_up:'#4ade80', peace:'#38bdf8', open_hand:'#fb923c',
  gun:'#f472b6', three_fingers:'#c084fc',
};

// ── DOM — Live tab ────────────────────────────────────────
const videoEl        = document.getElementById('video');
const canvasEl       = document.getElementById('canvas');
const ctx            = canvasEl.getContext('2d');
const gestureOverlay = document.getElementById('gesture-overlay');
const gestureMain    = document.getElementById('gesture-main');
const gestureEmoji   = document.getElementById('gesture-emoji');
const gestureLabel   = document.getElementById('gesture-label');
const gestureNameEl  = document.getElementById('gesture-name');
const ringProgress   = document.getElementById('ring-progress');
const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const fpsCounter     = document.getElementById('fps-counter');
const handCount      = document.getElementById('hand-count');
const lmCount        = document.getElementById('lm-count');
const gestureStateEl = document.getElementById('gesture-state-text');
const clockDisplay   = document.getElementById('clock-display');
const activityLog    = document.getElementById('activity-log');
const logCountEl     = document.getElementById('log-count');

// ── DOM — Challenge tab ───────────────────────────────────
const video2El       = document.getElementById('video2');
const canvas2El      = document.getElementById('canvas2');
const ctx2           = canvas2El.getContext('2d');
const chTargetBox    = document.getElementById('ch-target-box');
const chTargetEmoji  = document.getElementById('ch-target-emoji');
const chTargetName   = document.getElementById('ch-target-name');
const chDetectedEmoji= document.getElementById('ch-detected-emoji');
const chDetectedName = document.getElementById('ch-detected-name');
const chTimerBar     = document.getElementById('ch-timer-bar');
const chTimerText    = document.getElementById('ch-timer-text');
const chMatchFlash   = document.getElementById('ch-match-flash');
const chSequenceEl   = document.getElementById('ch-sequence');
const chHistoryEl    = document.getElementById('ch-history');
const chScoreEl      = document.getElementById('ch-score');
const chComboEl      = document.getElementById('ch-combo');
const chStreakEl      = document.getElementById('ch-streak');
const chLevelBadge   = document.getElementById('ch-level-badge');
const chLevelDesc    = document.getElementById('ch-level-desc');
const chRequiredCount= document.getElementById('ch-required-count');
const chStartBtn     = document.getElementById('ch-start-btn');
const chResetBtn     = document.getElementById('ch-reset-btn');
const chStarsEl      = document.getElementById('ch-stars');
const chViewportWrap = document.getElementById('ch-viewport-wrap');

// ── State — shared ────────────────────────────────────────
const RING_CIRC = 2 * Math.PI * 44;
let fpsFrames   = 0;
let lastFpsTime = performance.now();
let activeTab   = 'live';

// ── State — live tab ──────────────────────────────────────
let liveLastGesture     = null;
let liveLogCount        = 0;
// Stability buffer: gesture must persist N frames before accepted
const STABLE_FRAMES_NEEDED = 4;
let liveGestureBuffer   = [];   // recent gesture ids
let liveConfirmedGesture= null;

// ── State — challenge tab ─────────────────────────────────
let chRunning      = false;
let chLevel        = 1;
let chScore        = 0;
let chStreak       = 0;
let chCombo        = 1;
let chSequence     = [];   // array of gesture objects for current round
let chCurrent      = 0;    // index into chSequence
let chTimeLeft     = 10;   // seconds for each gesture
let chTimerHandle  = null;
let chMatchHold    = 0;    // frames held matching — require brief hold before accepting
const MATCH_HOLD_NEEDED = 8;

// Gesture hold tracker for challenge
let chLastRaw      = null;
let chHoldFrames   = 0;

// =========================================================
//  GESTURE DETECTOR FUNCTIONS
// =========================================================

/** Is a non-thumb finger extended? */
function isFingerExtended(lm, tip, pip) {
  return lm[tip].y < lm[pip].y - 0.035;
}

/** Is thumb extended (moves sideways)? */
function isThumbExtended(lm) {
  const tip   = lm[LM.THUMB_TIP];
  const mcp   = lm[LM.THUMB_MCP];
  const wrist = lm[LM.WRIST];
  // Use both X distance AND Y position (thumb up = tip above MCP)
  const horizDist = Math.abs(tip.x - wrist.x);
  const mcpDist   = Math.abs(mcp.x - wrist.x);
  return horizDist > mcpDist + 0.055;
}

/** Is finger curled (tip below MCP = clearly folded)? */
function isFingerCurled(lm, tip, mcp) {
  return lm[tip].y > lm[mcp].y + 0.02;
}

/** Get all 5 finger states */
function getFingers(lm) {
  return {
    thumb:  isThumbExtended(lm),
    index:  isFingerExtended(lm, LM.INDEX_TIP,  LM.INDEX_PIP),
    middle: isFingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring:   isFingerExtended(lm, LM.RING_TIP,   LM.RING_PIP),
    pinky:  isFingerExtended(lm, LM.PINKY_TIP,  LM.PINKY_PIP),
  };
}

/** Gesture 1: Thumb Up — thumb only, others clearly curled */
function isThumbUp(lm) {
  const f = getFingers(lm);
  const indexCurled  = isFingerCurled(lm, LM.INDEX_TIP,  LM.INDEX_MCP);
  const middleCurled = isFingerCurled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP);
  return f.thumb && !f.index && !f.middle && indexCurled && middleCurled;
}

/** Gesture 2: Peace ✌️ — index + middle, no thumb, ring and pinky down */
function isPeace(lm) {
  const f = getFingers(lm);
  const ringCurled  = isFingerCurled(lm, LM.RING_TIP,  LM.RING_MCP);
  const pinkyCurled = isFingerCurled(lm, LM.PINKY_TIP, LM.PINKY_MCP);
  return !f.thumb && f.index && f.middle && !f.ring && !f.pinky && ringCurled && pinkyCurled;
}

/** Gesture 3: Open Hand 🖐️ — all 5 fingers clearly extended */
function isOpenHand(lm) {
  const f = getFingers(lm);
  return f.thumb && f.index && f.middle && f.ring && f.pinky;
}

/** Gesture 4: Gun — thumb + index only, middle/ring/pinky curled */
function isGun(lm) {
  const f = getFingers(lm);
  const middleCurled = isFingerCurled(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP);
  const ringCurled   = isFingerCurled(lm, LM.RING_TIP,   LM.RING_MCP);
  return f.thumb && f.index && !f.middle && !f.ring && !f.pinky && middleCurled && ringCurled;
}

/** Gesture 5: Three Fingers — thumb + index + middle, ring + pinky curled */
function isThreeFingers(lm) {
  const f = getFingers(lm);
  const ringCurled  = isFingerCurled(lm, LM.RING_TIP,  LM.RING_MCP);
  const pinkyCurled = isFingerCurled(lm, LM.PINKY_TIP, LM.PINKY_MCP);
  return f.thumb && f.index && f.middle && !f.ring && !f.pinky && ringCurled && pinkyCurled;
}

// ── Gesture Registry ──────────────────────────────────────
const GESTURES = [
  { id:'open_hand',     label:'السلام',        emoji:'🖐️', detect:isOpenHand     },
  { id:'thumb_up',      label:'إبهام لأعلى',   emoji:'👍', detect:isThumbUp       },
  { id:'peace',         label:'علامة النصر',    emoji:'✌️', detect:isPeace         },
  { id:'three_fingers', label:'ثلاثة أصابع',    emoji:'🤟', detect:isThreeFingers  },
  { id:'gun',           label:'إبهام وسبابة',   emoji:'🤙', detect:isGun           },
];

/** Run all detectors, return first match or null */
function recognizeGesture(lm) {
  for (const g of GESTURES) {
    if (g.detect(lm)) return g;
  }
  return null;
}

/**
 * Stability filter: only returns a gesture once it has been
 * continuously detected for STABLE_FRAMES_NEEDED frames.
 */
function stabilizedGesture(rawGesture) {
  const id = rawGesture ? rawGesture.id : null;
  liveGestureBuffer.push(id);
  if (liveGestureBuffer.length > STABLE_FRAMES_NEEDED) {
    liveGestureBuffer.shift();
  }
  // All recent frames must agree
  if (liveGestureBuffer.length < STABLE_FRAMES_NEEDED) return null;
  const allSame = liveGestureBuffer.every(g => g === id);
  if (!allSame) return null;
  return rawGesture;
}

// =========================================================
//  DRAWING ENGINE (shared)
// =========================================================

function drawHand(landmarkCtx, landmarkCanvas, lm, gesture) {
  const connections = window.HAND_CONNECTIONS;
  const color = gesture ? (GESTURE_COLORS[gesture.id] || '#4ade80') : 'rgba(100,200,255,0.35)';

  // Connections
  if (connections) {
    landmarkCtx.lineWidth = 2.5;
    landmarkCtx.lineCap   = 'round';
    landmarkCtx.strokeStyle = color;
    for (const [a, b] of connections) {
      const p1 = lm[a], p2 = lm[b];
      landmarkCtx.beginPath();
      landmarkCtx.moveTo(p1.x * landmarkCanvas.width, p1.y * landmarkCanvas.height);
      landmarkCtx.lineTo(p2.x * landmarkCanvas.width, p2.y * landmarkCanvas.height);
      landmarkCtx.stroke();
    }
  }

  // Dots
  const TIPS = [4, 8, 12, 16, 20];
  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * landmarkCanvas.width;
    const y = lm[i].y * landmarkCanvas.height;
    const isTip = TIPS.includes(i);
    const r = isTip ? 8 : 4.5;

    if (isTip) {
      landmarkCtx.beginPath();
      landmarkCtx.arc(x, y, r + 6, 0, Math.PI * 2);
      landmarkCtx.fillStyle = color + '22';
      landmarkCtx.fill();
    }
    landmarkCtx.beginPath();
    landmarkCtx.arc(x, y, r, 0, Math.PI * 2);
    landmarkCtx.fillStyle = isTip ? color : '#38bdf8';
    landmarkCtx.fill();
    if (isTip) {
      landmarkCtx.beginPath();
      landmarkCtx.arc(x - 1.5, y - 1.5, r * 0.3, 0, Math.PI * 2);
      landmarkCtx.fillStyle = 'rgba(255,255,255,0.7)';
      landmarkCtx.fill();
    }
  }
}

// =========================================================
//  LIVE TAB UI
// =========================================================

function initCardColors() {
  document.querySelectorAll('.gcard').forEach(c => {
    c.style.setProperty('--card-color', c.dataset.color || '#c084fc');
  });
}

function setRingProgress(ratio, color) {
  const offset = RING_CIRC * (1 - ratio);
  ringProgress.style.strokeDashoffset = offset;
  ringProgress.style.stroke = color;
}

function updateLiveUI(gesture) {
  if (!gesture) {
    if (liveLastGesture !== null) {
      gestureMain.className = '';
      gestureEmoji.textContent = '✋';
      gestureLabel.textContent = 'في انتظار';
      gestureNameEl.textContent = 'الإيماءة';
      gestureNameEl.style.color = 'var(--muted)';
      setRingProgress(0, '#334155');
      document.querySelectorAll('.gcard').forEach(c => c.classList.remove('active'));
      gestureStateEl.textContent = '--';
      liveLastGesture = null;
    }
    return;
  }

  if (gesture.id !== liveLastGesture) {
    const color = GESTURE_COLORS[gesture.id] || '#c084fc';
    gestureEmoji.textContent = gesture.emoji;
    gestureLabel.textContent = 'تم التعرف على';
    gestureNameEl.textContent = gesture.label;
    gestureNameEl.style.color = color;
    gestureMain.className = gesture.id;
    gestureStateEl.textContent = gesture.label;
    setRingProgress(1, color);
    gestureOverlay.classList.remove('pop');
    void gestureOverlay.offsetWidth;
    gestureOverlay.classList.add('pop');
    document.querySelectorAll('.gcard').forEach(c => {
      c.classList.toggle('active', c.dataset.id === gesture.id);
    });
    addLog(gesture);
    liveLastGesture = gesture.id;
  }
}

function addLog(gesture) {
  const timeStr = new Date().toLocaleTimeString('en', { hour12:false });
  liveLogCount++;
  logCountEl.textContent = liveLogCount;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-icon">${gesture.emoji}</span><span class="log-text">${gesture.label}</span><span class="log-time">${timeStr}</span>`;
  activityLog.prepend(entry);
  if (activityLog.children.length > 20) activityLog.removeChild(activityLog.lastChild);
}

// =========================================================
//  MEDIAPIPE — LIVE
// =========================================================

function onResultsLive(results) {
  canvasEl.width  = videoEl.videoWidth  || canvasEl.offsetWidth;
  canvasEl.height = videoEl.videoHeight || canvasEl.offsetHeight;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  fpsFrames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsCounter.textContent = `${fpsFrames} FPS`;
    fpsFrames = 0; lastFpsTime = now;
  }

  const hands = results.multiHandLandmarks;
  if (!hands || !hands.length) {
    handCount.textContent = '0';
    lmCount.textContent   = '--/21';
    updateLiveUI(null);
    liveGestureBuffer = [];
    return;
  }

  handCount.textContent = String(hands.length);
  const lm = hands[0];
  lmCount.textContent = `${lm.length}/21`;

  const rawGesture = recognizeGesture(lm);
  const stable     = stabilizedGesture(rawGesture);

  drawHand(ctx, canvasEl, lm, stable);
  updateLiveUI(stable);
}

// =========================================================
//  MEDIAPIPE — CHALLENGE
// =========================================================

function onResultsChallenge(results) {
  canvas2El.width  = video2El.videoWidth  || canvas2El.offsetWidth;
  canvas2El.height = video2El.videoHeight || canvas2El.offsetHeight;
  ctx2.clearRect(0, 0, canvas2El.width, canvas2El.height);

  const hands = results.multiHandLandmarks;
  if (!hands || !hands.length) {
    chDetectedEmoji.textContent = '✋';
    chDetectedName.textContent  = '--';
    chLastRaw   = null;
    chHoldFrames = 0;
    return;
  }

  const lm = hands[0];
  const rawGesture = recognizeGesture(lm);

  // Display what the user is doing
  if (rawGesture) {
    chDetectedEmoji.textContent = rawGesture.emoji;
    chDetectedName.textContent  = rawGesture.label;
  } else {
    chDetectedEmoji.textContent = '✋';
    chDetectedName.textContent  = '--';
  }

  // Hold-based matching for challenge
  if (chRunning && chSequence.length > 0) {
    const target = chSequence[chCurrent];
    if (rawGesture && rawGesture.id === target.id) {
      if (rawGesture.id === chLastRaw) {
        chHoldFrames++;
      } else {
        chHoldFrames = 1;
      }
      chLastRaw = rawGesture.id;

      if (chHoldFrames >= MATCH_HOLD_NEEDED) {
        chHoldFrames = 0;
        chLastRaw    = null;
        handleGestureMatch();
      }
    } else {
      chHoldFrames = 0;
      chLastRaw    = rawGesture ? rawGesture.id : null;
      chTargetBox.classList.remove('matched');
    }
  }

  const currentTargetGesture = chRunning && chSequence[chCurrent] ? chSequence[chCurrent] : null;
  const isMatch = rawGesture && currentTargetGesture && rawGesture.id === currentTargetGesture.id;
  drawHand(ctx2, canvas2El, lm, isMatch ? rawGesture : null);
}

// =========================================================
//  CHALLENGE SYSTEM
// =========================================================

/** How many gestures per level: levels 1-5 need 2,3,4,5,6 gestures */
function gesturesForLevel(lvl) {
  return Math.min(lvl + 1, GESTURES.length);
}

/** Build a random sequence of gestures for current level */
function buildSequence(count) {
  const pool = [...GESTURES];
  const seq  = [];
  let last   = null;
  for (let i = 0; i < count; i++) {
    // Avoid repeating same gesture back-to-back
    let pick;
    do { pick = pool[Math.floor(Math.random() * pool.length)]; }
    while (pick === last && pool.length > 1);
    seq.push(pick);
    last = pick;
  }
  return seq;
}

/** Render the sequence boxes */
function renderSequence() {
  chSequenceEl.innerHTML = '';
  chSequence.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'seq-item ' + (i < chCurrent ? 'done' : i === chCurrent ? 'current' : 'pending');
    div.textContent = g.emoji;
    div.title = g.label;
    chSequenceEl.appendChild(div);
  });
}

/** Update the target gesture display */
function showTarget() {
  if (!chSequence[chCurrent]) return;
  const g = chSequence[chCurrent];
  chTargetEmoji.textContent = g.emoji;
  chTargetName.textContent  = g.label;
  chTargetBox.classList.remove('matched');
}

/** Called when the user successfully matches a gesture */
function handleGestureMatch() {
  // Visual flash
  chTargetBox.classList.add('matched');
  chMatchFlash.classList.add('show');
  setTimeout(() => chMatchFlash.classList.remove('show'), 180);

  // Score: base + time bonus + combo
  const timeBonus  = Math.floor(chTimeLeft * 10);
  const basePoints = 100;
  const earned     = (basePoints + timeBonus) * chCombo;

  chScore  += earned;
  chStreak++;
  chCombo   = Math.min(Math.floor(1 + chStreak / 2), 5);

  chScoreEl.textContent = chScore;
  chComboEl.textContent = `x${chCombo}`;
  chStreakEl.textContent = chStreak;

  showScorePopup(earned);

  // Mark done in sequence
  const items = chSequenceEl.querySelectorAll('.seq-item');
  if (items[chCurrent]) items[chCurrent].className = 'seq-item done';
  chCurrent++;

  if (chCurrent >= chSequence.length) {
    // Level complete!
    clearInterval(chTimerHandle);
    setTimeout(levelComplete, 400);
  } else {
    // Next gesture — reset timer
    resetTimer();
    showTarget();
    renderSequence();
  }
}

/** Reset the 10-second timer */
function resetTimer() {
  chTimeLeft = 10;
  updateTimerUI();
}

/** Called every second while running */
function tickTimer() {
  if (!chRunning) return;
  chTimeLeft = Math.max(0, chTimeLeft - 1);
  updateTimerUI();
  if (chTimeLeft === 0) {
    handleTimerExpired();
  }
}

function updateTimerUI() {
  const pct = (chTimeLeft / 10) * 100;
  chTimerBar.style.width = pct + '%';
  chTimerText.textContent = chTimeLeft;
  chTimerBar.classList.toggle('danger', chTimeLeft <= 3);
}

/** Timer expired — mark current gesture failed, break streak */
function handleTimerExpired() {
  chStreak = 0;
  chCombo  = 1;
  chComboEl.textContent = 'x1';
  chStreakEl.textContent = '0';

  const items = chSequenceEl.querySelectorAll('.seq-item');
  if (items[chCurrent]) {
    items[chCurrent].className = 'seq-item failed';
    setTimeout(() => {
      items[chCurrent] && (items[chCurrent].className = 'seq-item current');
    }, 500);
  }

  chTimeLeft = 10;
  updateTimerUI();
}

/** All gestures done — advance to next level */
function levelComplete() {
  chRunning = false;
  clearInterval(chTimerHandle);

  // Stars: based on speed (approximated by how much of average time remained)
  const stars = chStreak > 0 ? Math.min(5, Math.ceil(chStreak / 1.2)) : 1;
  earnStars(stars);

  // Add to history
  addHistory(chLevel, chScore);

  chLevel++;
  chLevelBadge.textContent = chLevel;
  const needed = gesturesForLevel(chLevel);
  chRequiredCount.textContent = needed;

  // Short pause, then auto-start next level
  chStartBtn.textContent = `▶ المستوى ${chLevel}`;
  chStartBtn.disabled    = false;
}

function earnStars(count) {
  const stars = chStarsEl.querySelectorAll('.star');
  stars.forEach((s, i) => {
    s.classList.toggle('earned', i < count);
  });
}

function addHistory(level, score) {
  const row = document.createElement('div');
  row.className = 'ch-hist-row';
  row.innerHTML = `<span class="ch-hist-level">L${level}</span><span class="ch-hist-result">مكتمل ✓</span><span class="ch-hist-score">${score}</span>`;
  chHistoryEl.prepend(row);
}

/** Float a score popup from the target box */
function showScorePopup(points) {
  const rect = chTargetBox.getBoundingClientRect();
  const el   = document.createElement('div');
  el.className   = 'score-popup';
  el.textContent = `+${points}`;
  el.style.left  = rect.left + rect.width / 2 - 30 + 'px';
  el.style.top   = rect.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

/** Countdown 3-2-1 overlay before starting */
function showCountdown(cb) {
  const overlay = document.createElement('div');
  overlay.id = 'countdown-overlay';
  const numEl = document.createElement('div');
  numEl.id = 'countdown-num';
  overlay.appendChild(numEl);
  chViewportWrap.appendChild(overlay);

  let n = 3;
  function tick() {
    numEl.textContent = n;
    numEl.style.animation = 'none';
    void numEl.offsetWidth;
    numEl.style.animation = '';
    n--;
    if (n < 0) {
      overlay.remove();
      cb();
    } else {
      setTimeout(tick, 900);
    }
  }
  tick();
}

/** Start a new round */
function startChallenge() {
  const needed     = gesturesForLevel(chLevel);
  chSequence       = buildSequence(needed);
  chCurrent        = 0;
  chHoldFrames     = 0;
  chLastRaw        = null;
  chRequiredCount.textContent = needed;
  chLevelBadge.textContent    = chLevel;
  chStartBtn.disabled         = true;
  chStartBtn.textContent      = '⏳ جاري التحدي...';

  earnStars(0);
  renderSequence();
  showTarget();
  resetTimer();

  showCountdown(() => {
    chRunning = true;
    clearInterval(chTimerHandle);
    chTimerHandle = setInterval(tickTimer, 1000);
  });
}

/** Full reset: back to level 1 */
function fullReset() {
  clearInterval(chTimerHandle);
  chRunning  = false;
  chLevel    = 1;
  chScore    = 0;
  chStreak   = 0;
  chCombo    = 1;
  chSequence = [];
  chCurrent  = 0;
  chHoldFrames = 0;
  chLastRaw    = null;

  chScoreEl.textContent       = '0';
  chComboEl.textContent       = 'x1';
  chStreakEl.textContent       = '0';
  chLevelBadge.textContent    = '1';
  chRequiredCount.textContent = '2';
  chStartBtn.textContent      = '▶ ابدأ التحدي';
  chStartBtn.disabled         = false;
  chTimerBar.style.width      = '100%';
  chTimerText.textContent     = '10';
  chTimerBar.classList.remove('danger');
  chTargetEmoji.textContent   = '🎯';
  chTargetName.textContent    = 'اضغط ابدأ';
  chSequenceEl.innerHTML      = '';
  chHistoryEl.innerHTML       = '';
  earnStars(0);
}

// ── Button bindings ───────────────────────────────────────
chStartBtn.addEventListener('click', startChallenge);
chResetBtn.addEventListener('click', fullReset);

// =========================================================
//  TAB SWITCHING
// =========================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    activeTab  = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tab));
  });
});

// =========================================================
//  MEDIAPIPE INIT
// =========================================================

function initMediaPipe() {
  // ── LIVE hands instance ──
  const handsLive = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  handsLive.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:.72, minTrackingConfidence:.65 });
  handsLive.onResults(onResultsLive);

  const cameraLive = new Camera(videoEl, {
    onFrame: async () => { await handsLive.send({ image: videoEl }); },
    width:1280, height:720,
  });
  cameraLive.start().then(() => {
    statusDot.classList.add('active');
    statusText.textContent = 'النظام يعمل';
  }).catch(err => { statusText.textContent = 'خطأ: ' + err.message; });

  // ── CHALLENGE hands instance ──
  const handsChallenge = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  handsChallenge.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:.72, minTrackingConfidence:.65 });
  handsChallenge.onResults(onResultsChallenge);

  const cameraChallenge = new Camera(video2El, {
    onFrame: async () => { await handsChallenge.send({ image: video2El }); },
    width:1280, height:720,
  });
  cameraChallenge.start();
}

// =========================================================
//  CLOCK
// =========================================================
function updateClock() {
  clockDisplay.textContent = new Date().toLocaleTimeString('en', { hour12:false });
}
setInterval(updateClock, 1000);
updateClock();

// =========================================================
//  ENTRY POINT
// =========================================================
window.addEventListener('load', () => {
  initCardColors();
  initMediaPipe();
});
