// =========================================================
//  NEUROHAND — script.js
//  MediaPipe Hands + Gesture Recognition
//  Fully client-side, no backend required
// =========================================================

// ── Landmark Indices ──────────────────────────────────────
const LM = {
  WRIST: 0,
  THUMB_CMC:1, THUMB_MCP:2, THUMB_IP:3, THUMB_TIP:4,
  INDEX_MCP:5, INDEX_PIP:6, INDEX_DIP:7, INDEX_TIP:8,
  MIDDLE_MCP:9, MIDDLE_PIP:10, MIDDLE_DIP:11, MIDDLE_TIP:12,
  RING_MCP:13, RING_PIP:14, RING_DIP:15, RING_TIP:16,
  PINKY_MCP:17, PINKY_PIP:18, PINKY_DIP:19, PINKY_TIP:20,
};

// ── DOM ───────────────────────────────────────────────────
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

// ── State ─────────────────────────────────────────────────
let lastGesture = null;
let logCount    = 0;
let fpsFrames   = 0;
let lastFpsTime = performance.now();
const RING_CIRCUMFERENCE = 2 * Math.PI * 44; // r=44

// ── Gesture Palette ───────────────────────────────────────
const GESTURE_COLORS = {
  thumb_up:      '#4ade80',
  peace:         '#38bdf8',
  open_hand:     '#fb923c',
  gun:           '#f472b6',
  three_fingers: '#c084fc',
};

// =========================================================
//  GESTURE DETECTOR FUNCTIONS
// =========================================================

/**
 * Is a finger (index/middle/ring/pinky) extended?
 * Compares Y: tip must be clearly above PIP joint.
 */
function isFingerExtended(lm, tip, pip) {
  return lm[tip].y < lm[pip].y - 0.04;
}

/**
 * Is thumb extended?
 * Thumb moves horizontally — compare X distance from wrist.
 */
function isThumbExtended(lm) {
  const tip   = lm[LM.THUMB_TIP];
  const mcp   = lm[LM.THUMB_MCP];
  const wrist = lm[LM.WRIST];
  return Math.abs(tip.x - wrist.x) > Math.abs(mcp.x - wrist.x) + 0.06;
}

/** Helper: extract all finger states */
function getFingers(lm) {
  return {
    thumb:  isThumbExtended(lm),
    index:  isFingerExtended(lm, LM.INDEX_TIP,  LM.INDEX_PIP),
    middle: isFingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring:   isFingerExtended(lm, LM.RING_TIP,   LM.RING_PIP),
    pinky:  isFingerExtended(lm, LM.PINKY_TIP,  LM.PINKY_PIP),
  };
}

/** Gesture 1: Thumb Up — only thumb extended */
function isThumbUp(lm) {
  const f = getFingers(lm);
  return f.thumb && !f.index && !f.middle && !f.ring && !f.pinky;
}

/** Gesture 2: Peace ✌️ — index + middle only */
function isPeace(lm) {
  const f = getFingers(lm);
  return !f.thumb && f.index && f.middle && !f.ring && !f.pinky;
}

/** Gesture 3: Open Hand 🖐️ — all five fingers */
function isOpenHand(lm) {
  const f = getFingers(lm);
  return f.thumb && f.index && f.middle && f.ring && f.pinky;
}

/** Gesture 4: Gun / L-shape — thumb + index only */
function isGun(lm) {
  const f = getFingers(lm);
  return f.thumb && f.index && !f.middle && !f.ring && !f.pinky;
}

/** Gesture 5: Three Fingers — thumb + index + middle */
function isThreeFingers(lm) {
  const f = getFingers(lm);
  return f.thumb && f.index && f.middle && !f.ring && !f.pinky;
}

// =========================================================
//  GESTURE REGISTRY
//  Add new gestures here — no other changes needed.
// =========================================================
const GESTURES = [
  { id: 'open_hand',     label: 'السلام',        emoji: '🖐️', detect: isOpenHand     },
  { id: 'thumb_up',      label: 'إبهام لأعلى',   emoji: '👍', detect: isThumbUp       },
  { id: 'peace',         label: 'علامة النصر',    emoji: '✌️', detect: isPeace         },
  { id: 'three_fingers', label: 'ثلاثة أصابع',    emoji: '🤟', detect: isThreeFingers  },
  { id: 'gun',           label: 'إبهام وسبابة',   emoji: '🤙', detect: isGun           },
];

// =========================================================
//  RECOGNITION ENGINE
// =========================================================
function recognizeGesture(lm) {
  for (const g of GESTURES) {
    if (g.detect(lm)) return g;
  }
  return null;
}

// =========================================================
//  UI UPDATES
// =========================================================

/** Set card colors via CSS variable */
function initCardColors() {
  document.querySelectorAll('.gcard').forEach(card => {
    const color = card.dataset.color || '#c084fc';
    card.style.setProperty('--card-color', color);
  });
}

/** Animate the ring progress */
function setRingProgress(ratio, color) {
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  ringProgress.style.strokeDashoffset = offset;
  ringProgress.style.stroke = color;
}

/** Update gesture badge and cards */
function updateUI(gesture) {
  if (!gesture) {
    // No gesture detected
    if (lastGesture !== null) {
      gestureMain.className = '';
      gestureEmoji.textContent = '✋';
      gestureLabel.textContent = 'في انتظار';
      gestureNameEl.textContent = 'الإيماءة';
      gestureNameEl.style.color = 'var(--muted)';
      setRingProgress(0, '#334155');
      document.querySelectorAll('.gcard').forEach(c => c.classList.remove('active'));
      gestureStateEl.textContent = '--';
      lastGesture = null;
    }
    return;
  }

  if (gesture.id !== lastGesture) {
    const color = GESTURE_COLORS[gesture.id] || '#c084fc';

    // Update badge
    gestureEmoji.textContent = gesture.emoji;
    gestureLabel.textContent = 'تم التعرف على';
    gestureNameEl.textContent = gesture.label;
    gestureNameEl.style.color = color;

    gestureMain.className = gesture.id;
    gestureStateEl.textContent = gesture.label;

    // Ring
    setRingProgress(1, color);

    // Pop animation
    gestureOverlay.classList.remove('pop');
    void gestureOverlay.offsetWidth; // reflow
    gestureOverlay.classList.add('pop');

    // Cards
    document.querySelectorAll('.gcard').forEach(card => {
      card.classList.toggle('active', card.dataset.id === gesture.id);
    });

    // Log entry
    addLog(gesture);
    lastGesture = gesture.id;
  }
}

/** Add an entry to the activity log */
function addLog(gesture) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar', { hour12: false });
  logCount++;
  logCountEl.textContent = logCount;

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-icon">${gesture.emoji}</span>
    <span class="log-text">${gesture.label}</span>
    <span class="log-time">${timeStr}</span>
  `;
  activityLog.prepend(entry);

  // Keep log trimmed
  if (activityLog.children.length > 20) {
    activityLog.removeChild(activityLog.lastChild);
  }
}

// =========================================================
//  DRAWING ENGINE
// =========================================================

/** Draw landmark connections */
function drawConnections(lm, gesture) {
  const connections = window.HAND_CONNECTIONS;
  if (!connections) return;

  const activeColor   = gesture ? (GESTURE_COLORS[gesture.id] || '#4ade80') : '#00ff88';
  const inactiveColor = 'rgba(100,200,255,0.35)';

  ctx.lineWidth = 2.5;
  ctx.lineCap   = 'round';

  for (const [a, b] of connections) {
    const p1 = lm[a], p2 = lm[b];
    ctx.beginPath();
    ctx.moveTo(p1.x * canvasEl.width, p1.y * canvasEl.height);
    ctx.lineTo(p2.x * canvasEl.width, p2.y * canvasEl.height);
    ctx.strokeStyle = gesture ? activeColor : inactiveColor;
    ctx.stroke();
  }
}

/** Draw landmark dots */
function drawLandmarks(lm, gesture) {
  const activeColor = gesture ? (GESTURE_COLORS[gesture.id] || '#4ade80') : '#00ff88';
  const TIPS = [4, 8, 12, 16, 20];

  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * canvasEl.width;
    const y = lm[i].y * canvasEl.height;
    const isTip = TIPS.includes(i);
    const r = isTip ? 8 : 4.5;

    // Outer glow for tips
    if (isTip) {
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = `${activeColor}22`;
      ctx.fill();
    }

    // Main dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? activeColor : '#38bdf8';
    ctx.fill();

    // White center highlight for tips
    if (isTip) {
      ctx.beginPath();
      ctx.arc(x - 1.5, y - 1.5, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
    }
  }
}

// =========================================================
//  MEDIAPIPE RESULT HANDLER
// =========================================================
function onResults(results) {
  canvasEl.width  = videoEl.videoWidth  || canvasEl.offsetWidth;
  canvasEl.height = videoEl.videoHeight || canvasEl.offsetHeight;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // FPS
  fpsFrames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsCounter.textContent = `${fpsFrames} FPS`;
    fpsFrames   = 0;
    lastFpsTime = now;
  }

  const hands = results.multiHandLandmarks;

  if (!hands || hands.length === 0) {
    handCount.textContent = '0';
    lmCount.textContent   = '--/21';
    updateUI(null);
    return;
  }

  handCount.textContent = String(hands.length);

  const lm = hands[0];
  lmCount.textContent = `${lm.length}/21`;

  const gesture = recognizeGesture(lm);
  drawConnections(lm, gesture);
  drawLandmarks(lm, gesture);
  updateUI(gesture);
}

// =========================================================
//  CLOCK
// =========================================================
function updateClock() {
  const t = new Date().toLocaleTimeString('en', { hour12: false });
  clockDisplay.textContent = t;
}
setInterval(updateClock, 1000);
updateClock();

// =========================================================
//  MEDIAPIPE INIT
// =========================================================
function initMediaPipe() {
  const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,
    minDetectionConfidence: 0.72,
    minTrackingConfidence:  0.65,
  });

  hands.onResults(onResults);

  const camera = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }); },
    width: 1280,
    height: 720,
  });

  camera.start()
    .then(() => {
      statusDot.classList.add('active');
      statusText.textContent = 'النظام يعمل';
    })
    .catch(err => {
      statusText.textContent = 'خطأ: ' + err.message;
      console.error(err);
    });
}

// =========================================================
//  ENTRY POINT
// =========================================================
window.addEventListener('load', () => {
  initCardColors();
  initMediaPipe();
});
