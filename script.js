/* ============================================================
   NARUTO HAND SIGNS — script.js
   ============================================================ */

const HOLD_MS   = 1000;  // ms to hold pose before counting
const ROUND_SEC = 7;     // seconds per sign
const THRESHOLD = 0.70;  // match threshold (0–1)
const BOX_PAD   = 28;    // px padding around hand box

// 9 sign images — placed in ./signs/
// Finger descriptors analyzed from actual images:
//   fingers: [thumb, index, middle, ring, pinky]  1=extended 0=curled
//   thumbOut: thumb visibly abducted away from palm
//
// Duplicates (Hare×2, Bird×2) are intentional — same gesture, same descriptor.
// The challenge picks them randomly so the same seal can appear twice in one round.
const SIGNS = [
  // sign_01: Bird — palms together, fingers interlaced pointing up, thumbs crossed
  { id:1,  name:'Bird',   img:'signs/sign_01.png', fingers:[0,1,1,1,1], thumbOut:false },
  // sign_02: Ox — index fingers extended, other fingers interlocked/curled
  { id:2,  name:'Ox',     img:'signs/sign_02.png', fingers:[0,1,0,0,0], thumbOut:false },
  // sign_03: Monkey — hands clasped flat, fingers wrapped around each other
  { id:3,  name:'Monkey', img:'signs/sign_03.png', fingers:[0,0,0,0,0], thumbOut:false },
  // sign_04: Horse — fingers spread open and interlocked, palms facing
  { id:4,  name:'Horse',  img:'signs/sign_04.png', fingers:[1,1,1,1,1], thumbOut:true  },
  // sign_05: Hare — index + middle extended together (pointing gesture)
  { id:5,  name:'Hare',   img:'signs/sign_05.png', fingers:[0,1,1,0,0], thumbOut:false },
  // sign_06: Boar — hands overlapping flat, fingers extended and stacked
  { id:6,  name:'Boar',   img:'signs/sign_06.png', fingers:[1,1,1,1,1], thumbOut:false },
  // sign_07: Dog — fingers interlocked, index fingers of both hands raised
  { id:7,  name:'Dog',    img:'signs/sign_07.png', fingers:[0,1,0,0,0], thumbOut:true  },
  // sign_08: Hare (duplicate) — same as sign_05
  { id:8,  name:'Hare',   img:'signs/sign_08.png', fingers:[0,1,1,0,0], thumbOut:false },
  // sign_09: Bird (duplicate) — same as sign_01
  { id:9,  name:'Bird',   img:'signs/sign_09.png', fingers:[0,1,1,1,1], thumbOut:false },
];

// ─── STATE ────────────────────────────────────────────────────
let currentMode   = null;
let handsData     = [];
let mpCamera      = null;
let mpHands       = null;

let level         = 1;
let score         = 0;
let currentRound  = [];
let signIdx       = 0;
let completedSigns= [];
let roundDone     = false;
let timerLeft     = ROUND_SEC;
let timerIv       = null;
let holdStart     = null;
let isCounting    = false;

// ─── DOM ──────────────────────────────────────────────────────
const $             = id => document.getElementById(id);
const introScreen   = $('intro-screen');
const appEl         = $('app');
const videoEl       = $('video');
const overlayEl     = $('overlay');
const ctx           = overlayEl.getContext('2d');
const statusDot     = $('cam-status').querySelector('.status-dot');
const statusText    = $('status-text');
const mergeEl       = $('merge-indicator');
const headerTitle   = $('header-title');
const scoreDisplay  = $('score-display');
const scoreVal      = $('score-val');
const challengePanel= $('challenge-panel');
const signImagesEl  = $('sign-images');
const matchCircle   = $('match-circle');
const matchPct      = $('match-pct');
const timerBar      = $('timer-bar');
const timerSecEl    = $('timer-sec');
const levelNumEl    = $('level-num');
const signIdxEl     = $('sign-idx');
const signTotalEl   = $('sign-total');
const progressDots  = $('progress-dots');
const resultOverlay = $('result-overlay');
const resultKanji   = $('result-kanji');
const resultTitle   = $('result-title');
const resultSub     = $('result-sub');
const resultBtn     = $('result-btn');

// ─── PARTICLES ────────────────────────────────────────────────
(function() {
  const c = $('particles-bg'), p = c.getContext('2d');
  let W, H;
  const pts = Array.from({length:50}, () => ({
    x:Math.random()*innerWidth, y:Math.random()*innerHeight,
    r:Math.random()*1.4+0.3,
    vx:(Math.random()-.5)*.18, vy:(Math.random()-.5)*.18,
    a:Math.random()*.35+.08
  }));
  function resize(){ W=c.width=innerWidth; H=c.height=innerHeight; }
  resize(); addEventListener('resize', resize);
  (function draw(){
    p.clearRect(0,0,W,H);
    for(const pt of pts){
      p.beginPath(); p.arc(pt.x,pt.y,pt.r,0,Math.PI*2);
      p.fillStyle=`rgba(255,140,0,${pt.a})`; p.fill();
      pt.x+=pt.vx; pt.y+=pt.vy;
      if(pt.x<0)pt.x=W; if(pt.x>W)pt.x=0;
      if(pt.y<0)pt.y=H; if(pt.y>H)pt.y=0;
    }
    requestAnimationFrame(draw);
  })();
})();

// ─── MODE ENTRY ───────────────────────────────────────────────
function startMode(mode) {
  currentMode = mode;
  introScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  if (mode === 'explore') {
    headerTitle.textContent = '🖐 تجربة حرة';
    challengePanel.classList.add('hidden');
    scoreDisplay.classList.add('hidden');
  } else {
    headerTitle.textContent = '⚡ تحدي الجوتسو';
    challengePanel.classList.remove('hidden');
    scoreDisplay.classList.remove('hidden');
    level = 1; score = 0; scoreVal.textContent = 0;
    startRound();
  }
  initCamera();
}

function goBack() {
  stopChallenge();
  mpCamera?.stop(); mpCamera = null;
  mpHands?.close(); mpHands = null;
  handsData = [];
  appEl.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  introScreen.classList.remove('hidden');
}

// ─── CHALLENGE LOGIC ─────────────────────────────────────────
function signsForLevel(lvl) {
  const count = Math.min(lvl + 1, SIGNS.length);
  return [...SIGNS].sort(() => Math.random()-.5).slice(0, count);
}

function startRound() {
  roundDone = false; isCounting = false; holdStart = null;
  currentRound   = signsForLevel(level);
  signIdx        = 0;
  completedSigns = currentRound.map(() => false);
  levelNumEl.textContent  = level;
  signTotalEl.textContent = currentRound.length;
  buildSignImages(); buildDots(); updateIndicator(); startTimer();
}

function buildSignImages() {
  signImagesEl.innerHTML = '';
  currentRound.forEach((sign, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'sign-img-wrap' + (i===0?' active':'');
    wrap.id = `sw-${i}`;
    const img = document.createElement('img');
    img.src = sign.img; img.alt = sign.name;
    img.onerror = () => {
      img.style.display='none';
      wrap.style.cssText='background:#111927;min-height:110px;display:flex;align-items:center;justify-content:center;';
      const lbl = document.createElement('span');
      lbl.style.cssText='color:#ff8c00;font-size:11px;padding:4px;text-align:center;';
      lbl.textContent = sign.name;
      wrap.appendChild(lbl);
    };
    const num = document.createElement('div');
    num.className='sign-num'; num.textContent = i+1;
    const chk = document.createElement('div');
    chk.className='sign-check'; chk.textContent='✓';
    wrap.append(img, num, chk);
    signImagesEl.appendChild(wrap);
  });
}

function buildDots() {
  progressDots.innerHTML = '';
  currentRound.forEach((_,i) => {
    const d = document.createElement('div');
    d.className='p-dot'+(i===0?' active':''); d.id=`pd-${i}`;
    progressDots.appendChild(d);
  });
}

function updateIndicator() {
  signIdxEl.textContent = signIdx+1;
  currentRound.forEach((_,i) => {
    const w=$(`sw-${i}`), d=$(`pd-${i}`);
    if(!w) return;
    w.className='sign-img-wrap'; d.className='p-dot';
    if(completedSigns[i]){ w.classList.add('done'); d.classList.add('done'); }
    else if(i===signIdx){ w.classList.add('active'); d.classList.add('active'); }
  });
}

function startTimer() {
  clearInterval(timerIv);
  timerLeft = ROUND_SEC;
  renderTimer();
  timerIv = setInterval(() => {
    timerLeft -= .1; renderTimer();
    if(timerLeft <= 0){ clearInterval(timerIv); onFail(); }
  }, 100);
}

function renderTimer() {
  const pct = Math.max(0, timerLeft/ROUND_SEC);
  timerBar.style.width = (pct*100)+'%';
  timerSecEl.textContent = Math.ceil(timerLeft)+'s';
  timerBar.classList.toggle('danger', timerLeft < ROUND_SEC*.3);
}

function onSignMatched() {
  clearInterval(timerIv);
  completedSigns[signIdx] = true;
  updateIndicator();
  const next = signIdx + 1;
  if(next >= currentRound.length){ onWin(); return; }
  signIdx = next;
  updateIndicator();
  isCounting = false; holdStart = null;
  resetMatchUI(); startTimer();
}

function onWin() {
  roundDone = true;
  score += currentRound.length * 10 * level;
  scoreVal.textContent = score;
  resultKanji.textContent = '🎯';
  resultTitle.textContent = 'جوتسو مكتمل!';
  resultSub.textContent = `أتممت ${currentRound.length} حركة · +${currentRound.length*10*level} نقطة`;
  resultBtn.textContent = `المستوى ${level+1} ⚡`;
  resultOverlay.classList.remove('hidden');
}

function onFail() {
  roundDone = true; isCounting = false; holdStart = null;
  resultKanji.textContent = '💀';
  resultTitle.textContent = 'انتهى الوقت!';
  resultSub.textContent = `حاول مجدداً · نقاطك: ${score}`;
  resultBtn.textContent = 'حاول مجدداً 🔥';
  resultOverlay.classList.remove('hidden');
}

function nextRound() {
  resultOverlay.classList.add('hidden');
  if(resultKanji.textContent !== '💀') level++;
  startRound();
}

function stopChallenge() {
  clearInterval(timerIv); timerIv = null;
  isCounting = false; holdStart = null;
  resultOverlay.classList.add('hidden');
}

function resetMatchUI() {
  matchCircle.className='match-circle';
  matchCircle.style.background='';
  matchPct.textContent='0%';
}

// ─── CAMERA + MEDIAPIPE ───────────────────────────────────────
async function initCamera() {
  try {
    mpHands = new Hands({ locateFile: f =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}` });
    mpHands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.75,
      minTrackingConfidence: 0.6
    });
    mpHands.onResults(onResults);
    mpCamera = new Camera(videoEl, {
      onFrame: async () => { await mpHands.send({image: videoEl}); },
      width: 640, height: 480
    });
    await mpCamera.start();
    statusDot.classList.add('active');
    statusText.textContent = 'الكاميرا تعمل';
  } catch(e) {
    statusText.textContent = 'خطأ: ' + e.message;
  }
}

// ─── HAND RESULTS ────────────────────────────────────────────
function onResults(results) {
  const vw = videoEl.clientWidth;
  const vh = videoEl.clientHeight;
  overlayEl.width = vw; overlayEl.height = vh;
  ctx.clearRect(0,0,vw,vh);

  handsData = results.multiHandLandmarks || [];
  const labels = results.multiHandedness || [];

  if(!handsData.length){
    isCounting = false; holdStart = null;
    resetMatchUI(); return;
  }

  const boxes = handsData.map(lm => getBBox(lm, vw, vh));
  const merged = handsData.length===2 && boxesOverlap(boxes[0], boxes[1]);
  mergeEl.classList.toggle('hidden', !merged);

  if(merged){
    drawBox(unionBox(boxes[0],boxes[1]), '#ff8c00', '⚡ دمج');
  } else {
    boxes.forEach((box,i) => {
      const side  = labels[i]?.label || (i===0?'Left':'Right');
      const color = side==='Left' ? '#4af0ff' : '#ff8c00';
      drawBox(box, color, side==='Left'?'يسار':'يمين');
    });
  }
  handsData.forEach(lm => drawSkeleton(lm, vw, vh));

  if(currentMode==='challenge' && !roundDone && handsData.length){
    const sim = matchScore(handsData);
    updateMatchUI(sim);
    if(sim >= THRESHOLD){
      if(!isCounting){ isCounting=true; holdStart=Date.now(); }
      else if(Date.now()-holdStart >= HOLD_MS){ isCounting=false; holdStart=null; onSignMatched(); }
    } else { isCounting=false; holdStart=null; }
  }
}

// ─── DRAWING ──────────────────────────────────────────────────
function getBBox(lm, vw, vh) {
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of lm){
    const x=p.x*vw, y=p.y*vh;
    x1=Math.min(x1,x); x2=Math.max(x2,x);
    y1=Math.min(y1,y); y2=Math.max(y2,y);
  }
  return { x:x1-BOX_PAD, y:y1-BOX_PAD, w:(x2-x1)+BOX_PAD*2, h:(y2-y1)+BOX_PAD*2 };
}

function boxesOverlap(a,b){
  return !(a.x+a.w<b.x || b.x+b.w<a.x || a.y+a.h<b.y || b.y+b.h<a.y);
}

function unionBox(a,b){
  const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y);
  return { x, y, w:Math.max(a.x+a.w,b.x+b.w)-x, h:Math.max(a.y+a.h,b.y+b.h)-y };
}

function drawBox({x,y,w,h}, color, label) {
  ctx.save();
  ctx.shadowColor=color; ctx.shadowBlur=14;
  ctx.strokeStyle=color; ctx.lineWidth=2;
  ctx.strokeRect(x,y,w,h);
  const cs=14; ctx.lineWidth=3.5;
  [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([px,py,sx,sy])=>{
    ctx.beginPath(); ctx.moveTo(px+sx*cs,py); ctx.lineTo(px,py); ctx.lineTo(px,py+sy*cs); ctx.stroke();
  });
  ctx.shadowBlur=0;
  const tw=ctx.measureText(label).width+14;
  ctx.fillStyle='rgba(0,0,0,.72)';
  ctx.fillRect(x+w/2-tw/2, y-20, tw, 18);
  ctx.fillStyle=color; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
  ctx.fillText(label, x+w/2, y-6);
  ctx.restore();
}

const CONNECTIONS=[
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];

function drawSkeleton(lm, vw, vh) {
  ctx.save();
  ctx.strokeStyle='rgba(255,200,100,.3)'; ctx.lineWidth=1.5;
  for(const [a,b] of CONNECTIONS){
    ctx.beginPath();
    ctx.moveTo(lm[a].x*vw,lm[a].y*vh);
    ctx.lineTo(lm[b].x*vw,lm[b].y*vh);
    ctx.stroke();
  }
  ctx.fillStyle='rgba(255,200,100,.55)';
  for(const p of lm){ ctx.beginPath(); ctx.arc(p.x*vw,p.y*vh,2.2,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

// ─── POSE MATCHING — GEOMETRIC ────────────────────────────────
/*
  For each hand we extract 6 normalized features:
   [0..4] Per-finger extension ratio: tipDist/mcpDist clamped to [0,1].
          0 = fully curled, 1 = fully extended. Robust to hand scale.
   [5]    Thumb abduction angle (0..1 normalized by π).
          Distinguishes thumb-out vs thumb-tucked stances.

  We compare live features against a sign's descriptor using weighted
  Euclidean distance, converted to similarity via a Gaussian kernel.
  Two-hand average is used when both hands are detected.
*/

const TIP = [4, 8, 12, 16, 20];
const MCP = [2, 5,  9, 13, 17];

function d3(a,b){ return Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z); }

function handFeatures(lm) {
  const wrist = lm[0];
  const feat  = [];

  // Extension ratio per finger: how far tip is from wrist vs MCP
  for(let i=0; i<5; i++){
    const tipD = d3(lm[TIP[i]], wrist);
    const mcpD = d3(lm[MCP[i]], wrist) || 0.001;
    // Ratio > 1 = extended; we normalize to [0,1]
    feat.push(Math.min(tipD / mcpD, 2.0) / 2.0);
  }

  // Thumb abduction: angle between (thumb tip → thumb CMC) and (index MCP → wrist)
  const tv = { x:lm[4].x-lm[1].x, y:lm[4].y-lm[1].y, z:lm[4].z-lm[1].z };
  const iv = { x:lm[5].x-lm[0].x, y:lm[5].y-lm[0].y, z:lm[5].z-lm[0].z };
  const dot = tv.x*iv.x + tv.y*iv.y + tv.z*iv.z;
  const mag = (Math.hypot(tv.x,tv.y,tv.z) * Math.hypot(iv.x,iv.y,iv.z)) || 1;
  feat.push(Math.acos(Math.max(-1,Math.min(1, dot/mag))) / Math.PI);

  return feat;
}

function signToFeatures(sign) {
  // Map binary finger states to realistic continuous values
  const feat = sign.fingers.map(f => f ? 0.82 : 0.22);
  // Thumb abduction angle: out≈0.58π/π, tucked≈0.20π/π
  feat.push(sign.thumbOut ? 0.58 : 0.20);
  return feat;
}

// Gaussian similarity from weighted Euclidean distance
const W = [0.9, 1.3, 1.3, 1.3, 1.3, 1.0]; // weights per feature

function similarity(a, b) {
  let sum=0, wsum=0;
  for(let i=0; i<a.length; i++){
    sum  += W[i] * (a[i]-b[i])**2;
    wsum += W[i];
  }
  return Math.exp(-Math.sqrt(sum/wsum) * 5.0);
}

function matchScore(handsArr) {
  if(!handsArr.length || !currentRound[signIdx]) return 0;
  const ref = signToFeatures(currentRound[signIdx]);
  const scores = handsArr.map(lm => similarity(handFeatures(lm), ref));
  return scores.reduce((a,b)=>a+b,0) / scores.length;
}

function updateMatchUI(sim) {
  matchPct.textContent = Math.round(sim*100)+'%';
  matchCircle.classList.remove('good','medium');
  if(sim >= THRESHOLD)  matchCircle.classList.add('good');
  else if(sim >= 0.45)  matchCircle.classList.add('medium');

  if(isCounting && holdStart){
    const deg = Math.min(1,(Date.now()-holdStart)/HOLD_MS) * 360;
    matchCircle.style.background =
      `conic-gradient(var(--success) ${deg}deg, var(--surface2) ${deg}deg)`;
  } else {
    matchCircle.style.background='';
  }
}
