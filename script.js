// =========================================================
//  NEUROHAND v2.3 — script.js
//  FULLY FIXED:
//  - HAND_CONNECTIONS defined manually (CDN doesn't export it)
//  - Single camera shared between tabs (no double camera)
//  - Thumb detection fixed for both sideways AND up
//  - Finger detection thresholds tuned
//  - Stability buffer kept but tuned
// =========================================================

// ══════════════════════════════════════════════════════════
//  HAND CONNECTIONS — must be defined manually
//  MediaPipe CDN does NOT export HAND_CONNECTIONS on window
// ══════════════════════════════════════════════════════════
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],        // Thumb
  [0,5],[5,6],[6,7],[7,8],        // Index
  [5,9],[9,10],[10,11],[11,12],   // Middle
  [9,13],[13,14],[14,15],[15,16], // Ring
  [13,17],[17,18],[18,19],[19,20],// Pinky
  [0,17],[0,5],[5,9],[9,13],[13,17], // Palm
];

// ══════════════════════════════════════════════════════════
//  LANDMARK INDICES
// ══════════════════════════════════════════════════════════
const LM = {
  WRIST:0,
  THUMB_CMC:1, THUMB_MCP:2, THUMB_IP:3,  THUMB_TIP:4,
  INDEX_MCP:5, INDEX_PIP:6, INDEX_DIP:7,  INDEX_TIP:8,
  MIDDLE_MCP:9,MIDDLE_PIP:10,MIDDLE_DIP:11,MIDDLE_TIP:12,
  RING_MCP:13, RING_PIP:14, RING_DIP:15,  RING_TIP:16,
  PINKY_MCP:17,PINKY_PIP:18,PINKY_DIP:19, PINKY_TIP:20,
};

// ══════════════════════════════════════════════════════════
//  GESTURE COLOR PALETTE
// ══════════════════════════════════════════════════════════
const GESTURE_COLORS = {
  thumb_up:      '#4ade80',
  peace:         '#38bdf8',
  open_hand:     '#fb923c',
  gun:           '#f472b6',
  three_fingers: '#c084fc',
};

// ══════════════════════════════════════════════════════════
//  DOM REFERENCES
// ══════════════════════════════════════════════════════════
// — Shared / Header —
const statusDot    = document.getElementById('status-dot');
const statusText   = document.getElementById('status-text');
const fpsCounter   = document.getElementById('fps-counter');
const clockDisplay = document.getElementById('clock-display');

// — Live tab —
const videoEl        = document.getElementById('video');
const canvasEl       = document.getElementById('canvas');
const ctx            = canvasEl.getContext('2d');
const gestureOverlay = document.getElementById('gesture-overlay');
const gestureMain    = document.getElementById('gesture-main');
const gestureEmoji   = document.getElementById('gesture-emoji');
const gestureLabel   = document.getElementById('gesture-label');
const gestureNameEl  = document.getElementById('gesture-name');
const ringProgress   = document.getElementById('ring-progress');
const handCount      = document.getElementById('hand-count');
const lmCount        = document.getElementById('lm-count');
const gestureStateEl = document.getElementById('gesture-state-text');
const activityLog    = document.getElementById('activity-log');
const logCountEl     = document.getElementById('log-count');

// — Challenge tab —
const canvas2El       = document.getElementById('canvas2');
const ctx2            = canvas2El.getContext('2d');
const chTargetBox     = document.getElementById('ch-target-box');
const chTargetEmoji   = document.getElementById('ch-target-emoji');
const chTargetName    = document.getElementById('ch-target-name');
const chDetectedEmoji = document.getElementById('ch-detected-emoji');
const chDetectedName  = document.getElementById('ch-detected-name');
const chTimerBar      = document.getElementById('ch-timer-bar');
const chTimerText     = document.getElementById('ch-timer-text');
const chMatchFlash    = document.getElementById('ch-match-flash');
const chSequenceEl    = document.getElementById('ch-sequence');
const chHistoryEl     = document.getElementById('ch-history');
const chScoreEl       = document.getElementById('ch-score');
const chComboEl       = document.getElementById('ch-combo');
const chStreakEl       = document.getElementById('ch-streak');
const chLevelBadge    = document.getElementById('ch-level-badge');
const chRequiredCount = document.getElementById('ch-required-count');
const chStartBtn      = document.getElementById('ch-start-btn');
const chResetBtn      = document.getElementById('ch-reset-btn');
const chStarsEl       = document.getElementById('ch-stars');
const chViewportWrap  = document.getElementById('ch-viewport-wrap');

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
const RING_CIRC = 2 * Math.PI * 44;
let fpsFrames   = 0;
let lastFpsTime = performance.now();
let activeTab   = 'live';

// Live tab state
let liveLastGesture  = null;
let liveLogCount     = 0;
let stableBuffer     = [];   // last N raw gesture IDs
const STABLE_N       = 5;    // frames needed to confirm gesture

// Challenge state
let chRunning     = false;
let chLevel       = 1;
let chScore       = 0;
let chStreak      = 0;
let chCombo       = 1;
let chSequence    = [];
let chCurrent     = 0;
let chTimeLeft    = 10;
let chTimerHandle = null;
let chHoldId      = null;    // gesture ID being held
let chHoldFrames  = 0;
const HOLD_NEEDED = 10;      // frames to hold before accepting

// ══════════════════════════════════════════════════════════
//  GESTURE DETECTION HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Is a non-thumb finger extended?
 * The tip must be significantly above (smaller Y) the PIP joint.
 */
function isUp(lm, tip, pip) {
  return lm[tip].y < lm[pip].y - 0.04;
}

/**
 * Is a non-thumb finger clearly folded?
 * The tip must be below (larger Y) the MCP joint.
 */
function isDown(lm, tip, mcp) {
  return lm[tip].y > lm[mcp].y - 0.01;
}

/**
 * Is the thumb extended to the side?
 * Compares horizontal distance of TIP from wrist vs MCP from wrist.
 * Works for left and right hands.
 */
function isThumbSideways(lm) {
  const tipX   = lm[LM.THUMB_TIP].x;
  const mcpX   = lm[LM.THUMB_MCP].x;
  const wristX = lm[LM.WRIST].x;
  return Math.abs(tipX - wristX) > Math.abs(mcpX - wristX) + 0.04;
}

/**
 * Is the thumb pointing UP?
 * TIP must be well above both IP and MCP joints on Y axis.
 */
function isThumbUp_pos(lm) {
  return lm[LM.THUMB_TIP].y < lm[LM.THUMB_IP].y - 0.02 &&
         lm[LM.THUMB_IP].y  < lm[LM.THUMB_MCP].y;
}

/**
 * Is thumb "out" in any direction (sideways or up)?
 */
function isThumbOut(lm) {
  return isThumbSideways(lm) || isThumbUp_pos(lm);
}

// ── Collect all 5 finger states ──────────────────────────
function fingers(lm) {
  return {
    thumb:  isThumbOut(lm),
    index:  isUp(lm, LM.INDEX_TIP,  LM.INDEX_PIP),
    middle: isUp(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring:   isUp(lm, LM.RING_TIP,   LM.RING_PIP),
    pinky:  isUp(lm, LM.PINKY_TIP,  LM.PINKY_PIP),
  };
}

// ══════════════════════════════════════════════════════════
//  GESTURE DETECTORS — one function per gesture
// ══════════════════════════════════════════════════════════

/** 👍 Thumb Up: thumb up/out, all other fingers clearly curled */
function isThumbUp(lm) {
  const f = fingers(lm);
  return f.thumb
    && isDown(lm, LM.INDEX_TIP,  LM.INDEX_MCP)
    && isDown(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP)
    && isDown(lm, LM.RING_TIP,   LM.RING_MCP)
    && isDown(lm, LM.PINKY_TIP,  LM.PINKY_MCP);
}

/** ✌️ Peace: index + middle up, thumb/ring/pinky down */
function isPeace(lm) {
  const f = fingers(lm);
  return !f.thumb
    && f.index && f.middle
    && isDown(lm, LM.RING_TIP,  LM.RING_MCP)
    && isDown(lm, LM.PINKY_TIP, LM.PINKY_MCP);
}

/** 🖐️ Open Hand: all 5 fingers up */
function isOpenHand(lm) {
  const f = fingers(lm);
  return f.thumb && f.index && f.middle && f.ring && f.pinky;
}

/** 🤙 Gun: thumb + index up, rest down */
function isGun(lm) {
  const f = fingers(lm);
  return f.thumb && f.index
    && isDown(lm, LM.MIDDLE_TIP, LM.MIDDLE_MCP)
    && isDown(lm, LM.RING_TIP,   LM.RING_MCP)
    && isDown(lm, LM.PINKY_TIP,  LM.PINKY_MCP);
}

/** 🤟 Three Fingers: thumb + index + middle up, ring + pinky down */
function isThreeFingers(lm) {
  const f = fingers(lm);
  return f.thumb && f.index && f.middle
    && isDown(lm, LM.RING_TIP,  LM.RING_MCP)
    && isDown(lm, LM.PINKY_TIP, LM.PINKY_MCP);
}

// ══════════════════════════════════════════════════════════
//  GESTURE REGISTRY — add new gestures here only
// ══════════════════════════════════════════════════════════
const GESTURES = [
  { id:'open_hand',     label:'السلام',       emoji:'🖐️', detect: isOpenHand     },
  { id:'three_fingers', label:'ثلاثة أصابع',   emoji:'🤟', detect: isThreeFingers  },
  { id:'peace',         label:'علامة النصر',   emoji:'✌️', detect: isPeace         },
  { id:'gun',           label:'إبهام وسبابة',  emoji:'🤙', detect: isGun           },
  { id:'thumb_up',      label:'إبهام لأعلى',  emoji:'👍', detect: isThumbUp       },
];
// Note: order matters — more specific gestures first to avoid false matches

/** Run detectors, return first match or null */
function recognize(lm) {
  for (const g of GESTURES) {
    if (g.detect(lm)) return g;
  }
  return null;
}

/** Stability filter: gesture must appear for STABLE_N frames straight */
function stabilize(rawGesture) {
  const id = rawGesture ? rawGesture.id : null;
  stableBuffer.push(id);
  if (stableBuffer.length > STABLE_N) stableBuffer.shift();
  if (stableBuffer.length < STABLE_N) return null;
  const allSame = stableBuffer.every(x => x === id);
  return allSame ? rawGesture : null;
}

// ══════════════════════════════════════════════════════════
//  DRAWING ENGINE
// ══════════════════════════════════════════════════════════

/**
 * Draw skeleton + landmark dots on a given canvas.
 * @param {CanvasRenderingContext2D} c - context
 * @param {HTMLCanvasElement} cv - canvas element
 * @param {Array} lm - 21 landmarks [{x,y,z}]
 * @param {Object|null} gesture - matched gesture (for color)
 */
function drawHand(c, cv, lm, gesture) {
  const color = gesture
    ? (GESTURE_COLORS[gesture.id] || '#4ade80')
    : 'rgba(120,210,255,0.6)';

  // — Connections —
  c.lineCap   = 'round';
  c.lineJoin  = 'round';
  c.lineWidth = 3;
  c.strokeStyle = color;

  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = lm[a], p2 = lm[b];
    c.beginPath();
    c.moveTo(p1.x * cv.width, p1.y * cv.height);
    c.lineTo(p2.x * cv.width, p2.y * cv.height);
    c.stroke();
  }

  // — Dots —
  const TIPS = new Set([4, 8, 12, 16, 20]);
  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * cv.width;
    const y = lm[i].y * cv.height;
    const tip = TIPS.has(i);
    const r   = tip ? 9 : 5;

    // Glow halo for fingertips
    if (tip) {
      c.beginPath();
      c.arc(x, y, r + 7, 0, Math.PI * 2);
      c.fillStyle = color + '30';
      c.fill();
    }

    // Main circle
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = tip ? color : 'rgba(200,240,255,0.9)';
    c.fill();

    // White shine on tips
    if (tip) {
      c.beginPath();
      c.arc(x - 2, y - 2, r * 0.28, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fill();
    }
  }
}

// ══════════════════════════════════════════════════════════
//  LIVE TAB UI
// ══════════════════════════════════════════════════════════

function initCardColors() {
  document.querySelectorAll('.gcard').forEach(c => {
    c.style.setProperty('--card-color', c.dataset.color || '#c084fc');
  });
}

function setRing(ratio, color) {
  ringProgress.style.strokeDashoffset = RING_CIRC * (1 - ratio);
  ringProgress.style.stroke = color;
}

function updateLiveUI(gesture) {
  if (!gesture) {
    if (liveLastGesture !== null) {
      gestureMain.className   = '';
      gestureEmoji.textContent = '✋';
      gestureLabel.textContent = 'في انتظار';
      gestureNameEl.textContent = 'الإيماءة';
      gestureNameEl.style.color = 'var(--muted)';
      setRing(0, '#334155');
      document.querySelectorAll('.gcard').forEach(c => c.classList.remove('active'));
      gestureStateEl.textContent = '--';
      liveLastGesture = null;
    }
    return;
  }

  if (gesture.id !== liveLastGesture) {
    const color = GESTURE_COLORS[gesture.id] || '#c084fc';
    gestureEmoji.textContent  = gesture.emoji;
    gestureLabel.textContent  = 'تم التعرف على';
    gestureNameEl.textContent = gesture.label;
    gestureNameEl.style.color = color;
    gestureMain.className     = gesture.id;
    gestureStateEl.textContent = gesture.label;
    setRing(1, color);

    gestureOverlay.classList.remove('pop');
    void gestureOverlay.offsetWidth; // force reflow
    gestureOverlay.classList.add('pop');

    document.querySelectorAll('.gcard').forEach(c => {
      c.classList.toggle('active', c.dataset.id === gesture.id);
    });

    addActivityLog(gesture);
    liveLastGesture = gesture.id;
  }
}

function addActivityLog(gesture) {
  liveLogCount++;
  logCountEl.textContent = liveLogCount;
  const time = new Date().toLocaleTimeString('en', { hour12: false });
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-icon">${gesture.emoji}</span>
                  <span class="log-text">${gesture.label}</span>
                  <span class="log-time">${time}</span>`;
  activityLog.prepend(el);
  if (activityLog.children.length > 25) activityLog.removeChild(activityLog.lastChild);
}

// ══════════════════════════════════════════════════════════
//  CHALLENGE TAB UI
// ══════════════════════════════════════════════════════════

function gesturesForLevel(lvl) {
  return Math.min(lvl + 1, 6);
}

function buildSequence(count) {
  const result = [];
  let last = null;
  for (let i = 0; i < count; i++) {
    let pick;
    do { pick = GESTURES[Math.floor(Math.random() * GESTURES.length)]; }
    while (pick === last);
    result.push(pick);
    last = pick;
  }
  return result;
}

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

function showTarget() {
  const g = chSequence[chCurrent];
  if (!g) return;
  chTargetEmoji.textContent = g.emoji;
  chTargetName.textContent  = g.label;
  chTargetBox.classList.remove('matched');
}

function updateChallengeDetected(gesture) {
  if (gesture) {
    chDetectedEmoji.textContent = gesture.emoji;
    chDetectedName.textContent  = gesture.label;
  } else {
    chDetectedEmoji.textContent = '✋';
    chDetectedName.textContent  = '--';
  }
}

function handleMatch() {
  // Flash effects
  chTargetBox.classList.add('matched');
  chMatchFlash.classList.add('show');
  setTimeout(() => chMatchFlash.classList.remove('show'), 200);

  // Score
  const timeBonus = Math.floor(chTimeLeft * 10);
  const earned    = (100 + timeBonus) * chCombo;
  chScore  += earned;
  chStreak++;
  chCombo   = Math.min(1 + Math.floor(chStreak / 2), 5);

  chScoreEl.textContent  = chScore;
  chComboEl.textContent  = `x${chCombo}`;
  chStreakEl.textContent  = chStreak;
  showScorePopup(earned);

  // Mark done
  const items = chSequenceEl.querySelectorAll('.seq-item');
  if (items[chCurrent]) items[chCurrent].className = 'seq-item done';
  chCurrent++;

  if (chCurrent >= chSequence.length) {
    clearInterval(chTimerHandle);
    setTimeout(levelComplete, 500);
  } else {
    resetTimer();
    showTarget();
    renderSequence();
  }
}

function resetTimer() {
  chTimeLeft = 10;
  updateTimerUI();
}

function tickTimer() {
  if (!chRunning) return;
  chTimeLeft = Math.max(0, chTimeLeft - 1);
  updateTimerUI();
  if (chTimeLeft === 0) {
    // Time expired for this gesture — reset streak, restart timer
    chStreak = 0;
    chCombo  = 1;
    chComboEl.textContent = 'x1';
    chStreakEl.textContent = '0';
    const items = chSequenceEl.querySelectorAll('.seq-item');
    if (items[chCurrent]) {
      items[chCurrent].className = 'seq-item failed';
      setTimeout(() => {
        const el = chSequenceEl.querySelectorAll('.seq-item')[chCurrent];
        if (el) el.className = 'seq-item current';
      }, 600);
    }
    chTimeLeft = 10;
    updateTimerUI();
    chHoldId     = null;
    chHoldFrames = 0;
  }
}

function updateTimerUI() {
  chTimerBar.style.width  = (chTimeLeft / 10 * 100) + '%';
  chTimerText.textContent = chTimeLeft;
  chTimerBar.classList.toggle('danger', chTimeLeft <= 3);
}

function earnStars(count) {
  chStarsEl.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('earned', i < count);
  });
}

function levelComplete() {
  chRunning = false;
  clearInterval(chTimerHandle);
  const stars = Math.min(5, Math.max(1, Math.ceil(chStreak / 1.5)));
  earnStars(stars);
  addHistory(chLevel, chScore);
  chLevel++;
  chLevelBadge.textContent    = chLevel;
  chRequiredCount.textContent = gesturesForLevel(chLevel);
  chStartBtn.textContent  = `▶ المستوى ${chLevel}`;
  chStartBtn.disabled     = false;
}

function addHistory(level, score) {
  const row = document.createElement('div');
  row.className = 'ch-hist-row';
  row.innerHTML = `<span class="ch-hist-level">L${level}</span>
                   <span class="ch-hist-result">مكتمل ✓</span>
                   <span class="ch-hist-score">${score}</span>`;
  chHistoryEl.prepend(row);
}

function showScorePopup(pts) {
  const rect = chTargetBox.getBoundingClientRect();
  const el   = document.createElement('div');
  el.className   = 'score-popup';
  el.textContent = `+${pts}`;
  el.style.left  = rect.left + rect.width / 2 - 25 + 'px';
  el.style.top   = rect.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function showCountdown(cb) {
  const overlay = document.createElement('div');
  overlay.id = 'countdown-overlay';
  const numEl = document.createElement('div');
  numEl.id = 'countdown-num';
  overlay.appendChild(numEl);
  chViewportWrap.appendChild(overlay);
  let n = 3;
  function tick() {
    if (n === 0) { numEl.textContent = 'GO!'; }
    else         { numEl.textContent = n; }
    numEl.style.animation = 'none';
    void numEl.offsetWidth;
    numEl.style.animation = 'countPop .7s cubic-bezier(.34,1.56,.64,1) forwards';
    n--;
    if (n < 0) { setTimeout(() => { overlay.remove(); cb(); }, 700); }
    else       { setTimeout(tick, 900); }
  }
  tick();
}

function startChallenge() {
  chSequence   = buildSequence(gesturesForLevel(chLevel));
  chCurrent    = 0;
  chHoldId     = null;
  chHoldFrames = 0;
  chRequiredCount.textContent = chSequence.length;
  chLevelBadge.textContent    = chLevel;
  chStartBtn.disabled    = true;
  chStartBtn.textContent = '⏳ جاري التحدي...';
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

function fullReset() {
  clearInterval(chTimerHandle);
  chRunning  = false;
  chLevel    = 1;
  chScore    = 0;
  chStreak   = 0;
  chCombo    = 1;
  chSequence = [];
  chCurrent  = 0;
  chHoldId   = null;
  chHoldFrames = 0;
  chScoreEl.textContent       = '0';
  chComboEl.textContent       = 'x1';
  chStreakEl.textContent      = '0';
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

chStartBtn.addEventListener('click', startChallenge);
chResetBtn.addEventListener('click', fullReset);

// ══════════════════════════════════════════════════════════
//  MEDIAPIPE RESULT HANDLER
//  One single handler — routes to live or challenge based on activeTab
// ══════════════════════════════════════════════════════════

function onResults(results) {
  // ── FPS ──
  fpsFrames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsCounter.textContent = fpsFrames + ' FPS';
    fpsFrames   = 0;
    lastFpsTime = now;
  }

  const hands = results.multiHandLandmarks;
  const hasHand = hands && hands.length > 0;

  // ── LIVE TAB ──
  if (activeTab === 'live') {
    // Sync canvas size to video
    canvasEl.width  = videoEl.videoWidth  || canvasEl.offsetWidth;
    canvasEl.height = videoEl.videoHeight || canvasEl.offsetHeight;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (handCount) handCount.textContent = hasHand ? String(hands.length) : '0';
    if (lmCount)   lmCount.textContent   = hasHand ? `${hands[0].length}/21` : '--/21';

    if (!hasHand) {
      stableBuffer = [];
      updateLiveUI(null);
      return;
    }

    const lm  = hands[0];
    const raw = recognize(lm);
    const stable = stabilize(raw);
    drawHand(ctx, canvasEl, lm, stable);
    updateLiveUI(stable);

  // ── CHALLENGE TAB ──
  } else if (activeTab === 'challenge') {
    canvas2El.width  = videoEl.videoWidth  || canvas2El.offsetWidth;
    canvas2El.height = videoEl.videoHeight || canvas2El.offsetHeight;
    ctx2.clearRect(0, 0, canvas2El.width, canvas2El.height);

    if (!hasHand) {
      updateChallengeDetected(null);
      chHoldId     = null;
      chHoldFrames = 0;
      return;
    }

    const lm  = hands[0];
    const raw = recognize(lm);
    updateChallengeDetected(raw);

    // Hold-to-confirm matching
    if (chRunning && chSequence[chCurrent]) {
      const target = chSequence[chCurrent];
      if (raw && raw.id === target.id) {
        if (chHoldId === raw.id) {
          chHoldFrames++;
        } else {
          chHoldId     = raw.id;
          chHoldFrames = 1;
        }
        if (chHoldFrames >= HOLD_NEEDED) {
          chHoldId     = null;
          chHoldFrames = 0;
          handleMatch();
        }
      } else {
        chHoldId     = null;
        chHoldFrames = 0;
        chTargetBox.classList.remove('matched');
      }
    }

    const target = chRunning && chSequence[chCurrent] ? chSequence[chCurrent] : null;
    const matched = raw && target && raw.id === target.id;
    drawHand(ctx2, canvas2El, lm, matched ? raw : null);
  }
}

// ══════════════════════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-content').forEach(tc => {
      tc.classList.toggle('active', tc.id === 'tab-' + activeTab);
    });
    // Reset stable buffer on tab switch
    stableBuffer = [];
    liveLastGesture = null;
  });
});

// ══════════════════════════════════════════════════════════
//  MEDIAPIPE INIT — single camera, single Hands instance
// ══════════════════════════════════════════════════════════
function initMediaPipe() {
  const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,      // 0=lite, 1=full (more accurate)
    minDetectionConfidence: 0.65,
    minTrackingConfidence:  0.55,
  });

  hands.onResults(onResults);

  // Single Camera, single video element — challenge tab mirrors it via CSS
  const camera = new Camera(videoEl, {
    onFrame: async () => {
      await hands.send({ image: videoEl });
    },
    width: 1280,
    height: 720,
  });

  camera.start()
    .then(() => {
      statusDot.classList.add('active');
      statusText.textContent = 'النظام يعمل ✓';
    })
    .catch(err => {
      statusText.textContent = 'خطأ في الكاميرا';
      console.error('Camera error:', err);
    });
}

// ══════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════
setInterval(() => {
  clockDisplay.textContent = new Date().toLocaleTimeString('en', { hour12: false });
}, 1000);

// ══════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  initCardColors();
  initMediaPipe();
});
