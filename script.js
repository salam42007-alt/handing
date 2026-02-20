// =========================================================
//  NEUROHAND v3.0 — script.js
//  Three tabs: Live | Challenge | Powers
//  Powers: 2-hand support, record up to 20 gestures,
//          save temporarily, test/playback with error report
// =========================================================

// ══════════════════════════════════════════════════════════
//  HAND CONNECTIONS (defined manually — CDN doesn't export)
// ══════════════════════════════════════════════════════════
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],[5,9],[9,13],[13,17],
];

// ══════════════════════════════════════════════════════════
//  LANDMARK INDICES
// ══════════════════════════════════════════════════════════
const LM = {
  WRIST:0,
  THUMB_CMC:1,THUMB_MCP:2,THUMB_IP:3,THUMB_TIP:4,
  INDEX_MCP:5,INDEX_PIP:6,INDEX_DIP:7,INDEX_TIP:8,
  MIDDLE_MCP:9,MIDDLE_PIP:10,MIDDLE_DIP:11,MIDDLE_TIP:12,
  RING_MCP:13,RING_PIP:14,RING_DIP:15,RING_TIP:16,
  PINKY_MCP:17,PINKY_PIP:18,PINKY_DIP:19,PINKY_TIP:20,
};

const GESTURE_COLORS = {
  thumb_up:'#4ade80', peace:'#38bdf8', open_hand:'#fb923c',
  gun:'#f472b6', three_fingers:'#c084fc',
};

// ══════════════════════════════════════════════════════════
//  DOM REFS
// ══════════════════════════════════════════════════════════
const videoEl       = document.getElementById('video');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const fpsCounter    = document.getElementById('fps-counter');
const clockDisplay  = document.getElementById('clock-display');

// canvases — one per tab
const canvasLive      = document.getElementById('canvas-live');
const ctxLive         = canvasLive.getContext('2d');
const canvasChallenge = document.getElementById('canvas-challenge');
const ctxChallenge    = canvasChallenge.getContext('2d');
const canvasPowers    = document.getElementById('canvas-powers');
const ctxPowers       = canvasPowers.getContext('2d');

// live tab
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

// challenge tab
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

// powers tab
const pwRightChip    = document.getElementById('pw-right-chip');
const pwLeftChip     = document.getElementById('pw-left-chip');
const pwRecOverlay   = document.getElementById('pw-rec-overlay');
const pwRecCount     = document.getElementById('pw-rec-count');
const pwRecLabelEl   = document.getElementById('pw-rec-label');
const pwPlayOverlay  = document.getElementById('pw-play-overlay');
const pwPlayStep     = document.getElementById('pw-play-step');
const pwPlayInfo     = document.getElementById('pw-play-info');
const pwRecBarWrap   = document.getElementById('pw-rec-bar-wrap');
const pwRecBarFill   = document.getElementById('pw-rec-bar-fill');
const pwRecBarLabel  = document.getElementById('pw-rec-bar-label');
const pwRecPreview   = document.getElementById('pw-rec-preview');
const pwSeqName      = document.getElementById('pw-seq-name');
const pwRecStartBtn  = document.getElementById('pw-rec-start-btn');
const pwRecStopBtn   = document.getElementById('pw-rec-stop-btn');
const pwRecClearBtn  = document.getElementById('pw-rec-clear-btn');
const pwRecSaveBtn   = document.getElementById('pw-rec-save-btn');
const pwSavedList    = document.getElementById('pw-saved-list');
const pwSavedCount   = document.getElementById('pw-saved-count');
const pwResultBox    = document.getElementById('pw-result-box');
const pwResCorrect   = document.getElementById('pw-res-correct');
const pwResErrors    = document.getElementById('pw-res-errors');
const pwResAccuracy  = document.getElementById('pw-res-accuracy');
const pwResultSteps  = document.getElementById('pw-result-steps');
const pwRecordSection   = document.getElementById('pw-record-section');
const pwPlaybackSection = document.getElementById('pw-playback-section');
const pwViewportWrap    = document.getElementById('pw-viewport-wrap');

// ══════════════════════════════════════════════════════════
//  SHARED STATE
// ══════════════════════════════════════════════════════════
const RING_CIRC  = 2 * Math.PI * 44;
let fpsFrames    = 0;
let lastFpsTime  = performance.now();
let activeTab    = 'live';

// ══════════════════════════════════════════════════════════
//  GESTURE DETECTION
// ══════════════════════════════════════════════════════════
function isUp(lm, tip, pip) { return lm[tip].y < lm[pip].y - 0.04; }
function isDown(lm, tip, mcp){ return lm[tip].y > lm[mcp].y - 0.01; }

function isThumbOut(lm) {
  const tipX = lm[LM.THUMB_TIP].x, mcpX = lm[LM.THUMB_MCP].x, wX = lm[LM.WRIST].x;
  const sideways = Math.abs(tipX - wX) > Math.abs(mcpX - wX) + 0.04;
  const upward   = lm[LM.THUMB_TIP].y < lm[LM.THUMB_IP].y - 0.02 && lm[LM.THUMB_IP].y < lm[LM.THUMB_MCP].y;
  return sideways || upward;
}

function getF(lm) {
  return {
    thumb:  isThumbOut(lm),
    index:  isUp(lm, LM.INDEX_TIP,  LM.INDEX_PIP),
    middle: isUp(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring:   isUp(lm, LM.RING_TIP,   LM.RING_PIP),
    pinky:  isUp(lm, LM.PINKY_TIP,  LM.PINKY_PIP),
  };
}

function isThumbUp(lm)      { const f=getF(lm); return f.thumb && isDown(lm,LM.INDEX_TIP,LM.INDEX_MCP) && isDown(lm,LM.MIDDLE_TIP,LM.MIDDLE_MCP) && isDown(lm,LM.RING_TIP,LM.RING_MCP) && isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); }
function isPeace(lm)        { const f=getF(lm); return !f.thumb && f.index && f.middle && isDown(lm,LM.RING_TIP,LM.RING_MCP) && isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); }
function isOpenHand(lm)     { const f=getF(lm); return f.thumb && f.index && f.middle && f.ring && f.pinky; }
function isGun(lm)          { const f=getF(lm); return f.thumb && f.index && isDown(lm,LM.MIDDLE_TIP,LM.MIDDLE_MCP) && isDown(lm,LM.RING_TIP,LM.RING_MCP) && isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); }
function isThreeFingers(lm) { const f=getF(lm); return f.thumb && f.index && f.middle && isDown(lm,LM.RING_TIP,LM.RING_MCP) && isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); }

const GESTURES = [
  { id:'open_hand',     label:'السلام',      emoji:'🖐️', detect:isOpenHand     },
  { id:'three_fingers', label:'ثلاثة أصابع',  emoji:'🤟', detect:isThreeFingers  },
  { id:'peace',         label:'علامة النصر',  emoji:'✌️', detect:isPeace         },
  { id:'gun',           label:'إبهام وسبابة', emoji:'🤙', detect:isGun           },
  { id:'thumb_up',      label:'إبهام لأعلى', emoji:'👍', detect:isThumbUp       },
];

function recognize(lm) {
  for (const g of GESTURES) if (g.detect(lm)) return g;
  return null;
}

// ── Stability buffers per hand slot ──────────────────────
const STABLE_N = 5;
const stableBuffers = { 0:[], 1:[], live:[] };

function stabilize(key, raw) {
  const buf = stableBuffers[key] || (stableBuffers[key] = []);
  const id  = raw ? raw.id : null;
  buf.push(id);
  if (buf.length > STABLE_N) buf.shift();
  if (buf.length < STABLE_N) return null;
  return buf.every(x => x === id) ? raw : null;
}

// ══════════════════════════════════════════════════════════
//  DRAWING ENGINE
// ══════════════════════════════════════════════════════════
function drawHand(c, cv, lm, gesture, color) {
  const col = color || (gesture ? GESTURE_COLORS[gesture.id] || '#4ade80' : 'rgba(120,210,255,0.6)');
  c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = col;
  for (const [a,b] of HAND_CONNECTIONS) {
    const p1=lm[a], p2=lm[b];
    c.beginPath(); c.moveTo(p1.x*cv.width, p1.y*cv.height);
    c.lineTo(p2.x*cv.width, p2.y*cv.height); c.stroke();
  }
  const TIPS = new Set([4,8,12,16,20]);
  for (let i=0; i<lm.length; i++) {
    const x=lm[i].x*cv.width, y=lm[i].y*cv.height, tip=TIPS.has(i), r=tip?9:5;
    if (tip) { c.beginPath(); c.arc(x,y,r+7,0,Math.PI*2); c.fillStyle=col+'30'; c.fill(); }
    c.beginPath(); c.arc(x,y,r,0,Math.PI*2);
    c.fillStyle = tip ? col : 'rgba(200,240,255,0.9)'; c.fill();
    if (tip) { c.beginPath(); c.arc(x-2,y-2,r*.28,0,Math.PI*2); c.fillStyle='rgba(255,255,255,0.8)'; c.fill(); }
  }
}

function syncCanvas(cv, videoEl) {
  cv.width  = videoEl.videoWidth  || cv.offsetWidth;
  cv.height = videoEl.videoHeight || cv.offsetHeight;
}

// ══════════════════════════════════════════════════════════
//  LIVE TAB
// ══════════════════════════════════════════════════════════
let liveLastGesture = null;
let liveLogCount    = 0;

function initCardColors() {
  document.querySelectorAll('.gcard').forEach(c => c.style.setProperty('--card-color', c.dataset.color||'#c084fc'));
}

function setRing(ratio, color) {
  ringProgress.style.strokeDashoffset = RING_CIRC*(1-ratio);
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
      setRing(0,'#334155');
      document.querySelectorAll('.gcard').forEach(c=>c.classList.remove('active'));
      gestureStateEl.textContent = '--';
      liveLastGesture = null;
    }
    return;
  }
  if (gesture.id !== liveLastGesture) {
    const col = GESTURE_COLORS[gesture.id]||'#c084fc';
    gestureEmoji.textContent  = gesture.emoji;
    gestureLabel.textContent  = 'تم التعرف على';
    gestureNameEl.textContent = gesture.label;
    gestureNameEl.style.color = col;
    gestureMain.className     = gesture.id;
    gestureStateEl.textContent = gesture.label;
    setRing(1, col);
    gestureOverlay.classList.remove('pop');
    void gestureOverlay.offsetWidth;
    gestureOverlay.classList.add('pop');
    document.querySelectorAll('.gcard').forEach(c=>c.classList.toggle('active', c.dataset.id===gesture.id));
    addActivityLog(gesture);
    liveLastGesture = gesture.id;
  }
}

function addActivityLog(g) {
  liveLogCount++;
  logCountEl.textContent = liveLogCount;
  const t = new Date().toLocaleTimeString('en',{hour12:false});
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-icon">${g.emoji}</span><span class="log-text">${g.label}</span><span class="log-time">${t}</span>`;
  activityLog.prepend(el);
  if (activityLog.children.length > 25) activityLog.removeChild(activityLog.lastChild);
}

// ══════════════════════════════════════════════════════════
//  CHALLENGE TAB
// ══════════════════════════════════════════════════════════
let chRunning=false, chLevel=1, chScore=0, chStreak=0, chCombo=1;
let chSequence=[], chCurrent=0, chTimeLeft=10, chTimerHandle=null;
let chHoldId=null, chHoldFrames=0;
const CH_HOLD = 10;

function gesturesForLevel(l){ return Math.min(l+1,6); }
function buildSeq(n){
  const r=[]; let last=null;
  for(let i=0;i<n;i++){
    let p; do{p=GESTURES[Math.floor(Math.random()*GESTURES.length)]}while(p===last);
    r.push(p); last=p;
  }
  return r;
}
function renderSeq(){
  chSequenceEl.innerHTML='';
  chSequence.forEach((g,i)=>{
    const d=document.createElement('div');
    d.className='seq-item '+(i<chCurrent?'done':i===chCurrent?'current':'pending');
    d.textContent=g.emoji; d.title=g.label;
    chSequenceEl.appendChild(d);
  });
}
function showTarget(){
  const g=chSequence[chCurrent]; if(!g)return;
  chTargetEmoji.textContent=g.emoji; chTargetName.textContent=g.label;
  chTargetBox.classList.remove('matched');
}
function handleChMatch(){
  chTargetBox.classList.add('matched');
  chMatchFlash.classList.add('show'); setTimeout(()=>chMatchFlash.classList.remove('show'),200);
  const earned=(100+Math.floor(chTimeLeft*10))*chCombo;
  chScore+=earned; chStreak++; chCombo=Math.min(1+Math.floor(chStreak/2),5);
  chScoreEl.textContent=chScore; chComboEl.textContent=`x${chCombo}`; chStreakEl.textContent=chStreak;
  showScorePopup(earned);
  const items=chSequenceEl.querySelectorAll('.seq-item');
  if(items[chCurrent]) items[chCurrent].className='seq-item done';
  chCurrent++;
  if(chCurrent>=chSequence.length){ clearInterval(chTimerHandle); setTimeout(levelComplete,500); }
  else { resetChTimer(); showTarget(); renderSeq(); }
}
function resetChTimer(){ chTimeLeft=10; updateChTimerUI(); }
function tickChTimer(){
  if(!chRunning)return;
  chTimeLeft=Math.max(0,chTimeLeft-1); updateChTimerUI();
  if(chTimeLeft===0){
    chStreak=0; chCombo=1; chComboEl.textContent='x1'; chStreakEl.textContent='0';
    const items=chSequenceEl.querySelectorAll('.seq-item');
    if(items[chCurrent]){ items[chCurrent].className='seq-item failed'; setTimeout(()=>{ const el=chSequenceEl.querySelectorAll('.seq-item')[chCurrent]; if(el)el.className='seq-item current'; },600); }
    chTimeLeft=10; updateChTimerUI(); chHoldId=null; chHoldFrames=0;
  }
}
function updateChTimerUI(){
  chTimerBar.style.width=(chTimeLeft/10*100)+'%';
  chTimerText.textContent=chTimeLeft;
  chTimerBar.classList.toggle('danger',chTimeLeft<=3);
}
function earnStars(n){ chStarsEl.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('earned',i<n)); }
function levelComplete(){
  chRunning=false; clearInterval(chTimerHandle);
  earnStars(Math.min(5,Math.max(1,Math.ceil(chStreak/1.5))));
  const row=document.createElement('div'); row.className='ch-hist-row';
  row.innerHTML=`<span class="ch-hist-level">L${chLevel}</span><span class="ch-hist-result">مكتمل ✓</span><span class="ch-hist-score">${chScore}</span>`;
  chHistoryEl.prepend(row);
  chLevel++; chLevelBadge.textContent=chLevel; chRequiredCount.textContent=gesturesForLevel(chLevel);
  chStartBtn.textContent=`▶ المستوى ${chLevel}`; chStartBtn.disabled=false;
}
function showScorePopup(pts){
  const rect=chTargetBox.getBoundingClientRect();
  const el=document.createElement('div'); el.className='score-popup';
  el.textContent='+'+pts; el.style.left=rect.left+rect.width/2-25+'px'; el.style.top=rect.top+'px';
  document.body.appendChild(el); setTimeout(()=>el.remove(),1300);
}
function showCountdown(wrap,cb){
  const ov=document.createElement('div'); ov.id='countdown-overlay';
  const ne=document.createElement('div'); ne.id='countdown-num'; ov.appendChild(ne); wrap.appendChild(ov);
  let n=3;
  function tick(){
    ne.textContent=n===0?'GO!':n;
    ne.style.animation='none'; void ne.offsetWidth; ne.style.animation='countPop .7s cubic-bezier(.34,1.56,.64,1) forwards';
    n--; if(n<0){setTimeout(()=>{ov.remove();cb();},700);}else{setTimeout(tick,900);}
  }
  tick();
}
function startChallenge(){
  chSequence=buildSeq(gesturesForLevel(chLevel)); chCurrent=0; chHoldId=null; chHoldFrames=0;
  chRequiredCount.textContent=chSequence.length; chLevelBadge.textContent=chLevel;
  chStartBtn.disabled=true; chStartBtn.textContent='⏳ جاري التحدي...';
  earnStars(0); renderSeq(); showTarget(); resetChTimer();
  showCountdown(chViewportWrap,()=>{ chRunning=true; clearInterval(chTimerHandle); chTimerHandle=setInterval(tickChTimer,1000); });
}
function fullResetChallenge(){
  clearInterval(chTimerHandle); chRunning=false; chLevel=1; chScore=0; chStreak=0; chCombo=1; chSequence=[]; chCurrent=0; chHoldId=null; chHoldFrames=0;
  chScoreEl.textContent='0'; chComboEl.textContent='x1'; chStreakEl.textContent='0';
  chLevelBadge.textContent='1'; chRequiredCount.textContent='2';
  chStartBtn.textContent='▶ ابدأ التحدي'; chStartBtn.disabled=false;
  chTimerBar.style.width='100%'; chTimerText.textContent='10'; chTimerBar.classList.remove('danger');
  chTargetEmoji.textContent='🎯'; chTargetName.textContent='اضغط ابدأ';
  chSequenceEl.innerHTML=''; chHistoryEl.innerHTML=''; earnStars(0);
}
chStartBtn.addEventListener('click',startChallenge);
chResetBtn.addEventListener('click',fullResetChallenge);

// ══════════════════════════════════════════════════════════
//  POWERS TAB
//  States: idle → countdown → recording → idle
//          idle → playing
// ══════════════════════════════════════════════════════════
const MAX_REC = 20;
let pwState        = 'idle';  // 'idle' | 'countdown' | 'recording' | 'playing'
let pwRecorded     = [];      // array of gesture objects recorded so far
let pwSaved        = [];      // array of {name, gestures:[]} saved sequences
let pwSelectedSave = -1;      // index into pwSaved for playback
let pwPlayIndex    = 0;       // current step in playback
let pwPlayHoldId   = null;
let pwPlayHoldF    = 0;
let pwRecHoldId    = null;
let pwRecHoldF     = 0;
const PW_HOLD      = 12;      // frames to hold before capturing / accepting
let pwMode         = 'record';// 'record' | 'playback'
let pwRecIndicator = null;    // DOM element shown while recording
let pwPlayResults  = [];      // per-step result: true/false

// ── Recording countdown then record ──────────────────────
function pwStartCountdown() {
  if (pwState !== 'idle') return;
  pwState = 'countdown';
  pwRecStartBtn.disabled = true;
  // Show countdown overlay
  pwRecOverlay.classList.remove('hidden');
  let n = 3;
  function tick() {
    pwRecCount.textContent  = n;
    pwRecLabelEl.textContent = n > 0 ? 'استعد...' : 'سجّل!';
    pwRecCount.style.animation = 'none'; void pwRecCount.offsetWidth;
    pwRecCount.style.animation = 'countPop .6s cubic-bezier(.34,1.56,.64,1) forwards';
    n--;
    if (n < 0) { pwRecOverlay.classList.add('hidden'); pwBeginRecording(); }
    else       { setTimeout(tick, 900); }
  }
  tick();
}

function pwBeginRecording() {
  pwState       = 'recording';
  pwRecHoldId   = null;
  pwRecHoldF    = 0;
  // Show red REC indicator on viewport
  if (!pwRecIndicator) {
    pwRecIndicator = document.createElement('div');
    pwRecIndicator.className = 'rec-indicator';
    pwRecIndicator.innerHTML = '<div class="rec-dot"></div><div class="rec-text">REC</div>';
    pwViewportWrap.appendChild(pwRecIndicator);
  }
  pwRecBarWrap.classList.remove('hidden');
  pwRecStopBtn.disabled = false;
  updatePwRecBar();
}

function pwStopRecording() {
  if (pwState !== 'recording') return;
  pwState = 'idle';
  if (pwRecIndicator) { pwRecIndicator.remove(); pwRecIndicator = null; }
  pwRecBarWrap.classList.add('hidden');
  pwRecStartBtn.disabled = false;
  pwRecStopBtn.disabled  = true;
  pwRecSaveBtn.disabled  = pwRecorded.length === 0;
}

function pwCaptureGesture(gesture) {
  if (pwRecorded.length >= MAX_REC) { pwStopRecording(); return; }
  pwRecorded.push(gesture);
  // Add chip to preview
  const chip = document.createElement('div');
  chip.className   = 'pw-rec-chip';
  chip.textContent = gesture.emoji;
  chip.title       = gesture.label;
  pwRecPreview.appendChild(chip);
  updatePwRecBar();
  if (pwRecorded.length >= MAX_REC) pwStopRecording();
}

function updatePwRecBar() {
  const pct = (pwRecorded.length / MAX_REC) * 100;
  pwRecBarFill.style.width     = pct + '%';
  pwRecBarLabel.textContent    = `تسجيل ${pwRecorded.length} / ${MAX_REC}`;
  document.getElementById('pw-rec-count-badge').textContent = `${pwRecorded.length}/20`;
}

function pwClearRecording() {
  pwRecorded     = [];
  pwRecPreview.innerHTML = '';
  pwRecSaveBtn.disabled  = true;
  updatePwRecBar();
}

function pwSaveSequence() {
  const name = pwSeqName.value.trim() || `تسلسل ${pwSaved.length + 1}`;
  if (pwRecorded.length === 0) return;
  pwSaved.push({ name, gestures: [...pwRecorded] });
  pwSeqName.value = '';
  pwClearRecording();
  renderSavedList();
}

function renderSavedList() {
  pwSavedList.innerHTML = '';
  pwSavedCount.textContent = pwSaved.length;
  pwSaved.forEach((seq, i) => {
    const card = document.createElement('div');
    card.className = 'pw-saved-card' + (i === pwSelectedSave ? ' selected' : '');
    const emojis = seq.gestures.map(g=>g.emoji).join(' ');
    card.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="pw-saved-name">${seq.name}</div>
        <div class="pw-saved-emojis">${emojis}</div>
      </div>
      <div class="pw-saved-count">${seq.gestures.length} حركة</div>
      <button class="pw-saved-del" data-i="${i}" title="حذف">🗑</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('pw-saved-del')) return;
      pwSelectedSave = i;
      renderSavedList();
      pwResultBox.classList.add('hidden');
    });
    card.querySelector('.pw-saved-del').addEventListener('click', () => {
      pwSaved.splice(i, 1);
      if (pwSelectedSave >= pwSaved.length) pwSelectedSave = pwSaved.length - 1;
      renderSavedList();
    });
    pwSavedList.appendChild(card);
  });
  // Playback button
  let playBtn = document.getElementById('pw-play-now-btn');
  if (!playBtn) {
    playBtn = document.createElement('button');
    playBtn.id        = 'pw-play-now-btn';
    playBtn.className = 'ch-btn primary';
    playBtn.textContent = '▶ ابدأ الاختبار';
    playBtn.addEventListener('click', pwStartPlayback);
    pwPlaybackSection.appendChild(playBtn);
  }
}

// ── Playback ──────────────────────────────────────────────
function pwStartPlayback() {
  if (pwSelectedSave < 0 || pwSelectedSave >= pwSaved.length) return;
  if (pwState !== 'idle') return;
  const seq = pwSaved[pwSelectedSave];
  pwPlayIndex   = 0;
  pwPlayHoldId  = null;
  pwPlayHoldF   = 0;
  pwPlayResults = [];
  pwState       = 'playing';
  pwResultBox.classList.add('hidden');
  pwShowPlayStep();
}

function pwShowPlayStep() {
  const seq = pwSaved[pwSelectedSave];
  if (!seq || pwPlayIndex >= seq.gestures.length) { pwFinishPlayback(); return; }
  const g = seq.gestures[pwPlayIndex];
  pwPlayStep.textContent = g.emoji;
  pwPlayInfo.textContent = g.label;
  pwPlayOverlay.classList.remove('hidden');
}

function pwFinishPlayback() {
  pwState = 'idle';
  pwPlayOverlay.classList.add('hidden');
  // Show results
  const correct = pwPlayResults.filter(Boolean).length;
  const total   = pwPlayResults.length;
  const errors  = total - correct;
  const acc     = total > 0 ? Math.round(correct/total*100) : 0;
  pwResCorrect.textContent  = correct;
  pwResErrors.textContent   = errors;
  pwResAccuracy.textContent = acc + '%';
  // Step chips
  const seq = pwSaved[pwSelectedSave];
  pwResultSteps.innerHTML = '';
  pwPlayResults.forEach((ok, i) => {
    const chip = document.createElement('div');
    chip.className   = 'pw-step-chip ' + (ok ? 'ok' : 'err');
    chip.textContent = (seq.gestures[i]?.emoji||'?') + (ok?' ✓':' ✗');
    pwResultSteps.appendChild(chip);
  });
  pwResultBox.classList.remove('hidden');
}

// ── Powers mode switch ────────────────────────────────────
document.querySelectorAll('.pw-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    pwMode = btn.dataset.mode;
    document.querySelectorAll('.pw-mode-btn').forEach(b=>b.classList.toggle('active',b===btn));
    pwRecordSection.classList.toggle('hidden',   pwMode !== 'record');
    pwPlaybackSection.classList.toggle('hidden', pwMode !== 'playback');
    if (pwMode === 'playback') renderSavedList();
  });
});

// ── Powers controls ───────────────────────────────────────
pwRecStartBtn.addEventListener('click', pwStartCountdown);
pwRecStopBtn.addEventListener('click',  pwStopRecording);
pwRecClearBtn.addEventListener('click', pwClearRecording);
pwRecSaveBtn.addEventListener('click',  pwSaveSequence);

// ── Powers hand chip update ───────────────────────────────
function updateHandChips(handednessList, gesturesByHand) {
  const labels = { Right: pwRightChip, Left: pwLeftChip };
  // Reset
  Object.values(labels).forEach(el => { el.textContent='--'; el.classList.remove('active'); });
  if (!handednessList) return;
  handednessList.forEach((h, i) => {
    const label = h.label; // 'Right' or 'Left'
    const chip  = labels[label];
    if (!chip) return;
    const g = gesturesByHand[i];
    chip.textContent = g ? g.emoji + ' ' + g.label : '👐 مكتشف';
    chip.classList.add('active');
  });
}

// ══════════════════════════════════════════════════════════
//  MEDIAPIPE RESULT HANDLER
//  Single handler, routes by activeTab
// ══════════════════════════════════════════════════════════
function onResults(results) {
  // FPS counter
  fpsFrames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsCounter.textContent = fpsFrames + ' FPS';
    fpsFrames = 0; lastFpsTime = now;
  }

  const hands       = results.multiHandLandmarks   || [];
  const handedness  = results.multiHandedness       || [];

  // ── LIVE ──
  if (activeTab === 'live') {
    syncCanvas(canvasLive, videoEl);
    ctxLive.clearRect(0,0,canvasLive.width,canvasLive.height);
    if (handCount) handCount.textContent = hands.length;
    if (lmCount)   lmCount.textContent   = hands.length ? `${hands[0].length}/21` : '--/21';
    if (!hands.length) { stableBuffers.live=[]; updateLiveUI(null); return; }
    const lm  = hands[0];
    const raw = recognize(lm);
    const st  = stabilize('live', raw);
    drawHand(ctxLive, canvasLive, lm, st);
    updateLiveUI(st);
    return;
  }

  // ── CHALLENGE ──
  if (activeTab === 'challenge') {
    syncCanvas(canvasChallenge, videoEl);
    ctxChallenge.clearRect(0,0,canvasChallenge.width,canvasChallenge.height);
    if (!hands.length) {
      chDetectedEmoji.textContent='✋'; chDetectedName.textContent='--';
      chHoldId=null; chHoldFrames=0; return;
    }
    const lm  = hands[0];
    const raw = recognize(lm);
    if (raw) { chDetectedEmoji.textContent=raw.emoji; chDetectedName.textContent=raw.label; }
    else     { chDetectedEmoji.textContent='✋'; chDetectedName.textContent='--'; }
    // Hold-to-confirm
    if (chRunning && chSequence[chCurrent]) {
      const target = chSequence[chCurrent];
      if (raw && raw.id === target.id) {
        if (chHoldId === raw.id) chHoldFrames++; else { chHoldId=raw.id; chHoldFrames=1; }
        if (chHoldFrames >= CH_HOLD) { chHoldId=null; chHoldFrames=0; handleChMatch(); }
      } else { chHoldId=null; chHoldFrames=0; chTargetBox.classList.remove('matched'); }
    }
    const tgt   = chRunning && chSequence[chCurrent] ? chSequence[chCurrent] : null;
    const match = raw && tgt && raw.id === tgt.id;
    drawHand(ctxChallenge, canvasChallenge, lm, match ? raw : null);
    return;
  }

  // ── POWERS ──
  if (activeTab === 'powers') {
    syncCanvas(canvasPowers, videoEl);
    ctxPowers.clearRect(0,0,canvasPowers.width,canvasPowers.height);

    // Detect gestures for each hand
    const gesturesByHand = hands.map((lm, i) => {
      const raw = recognize(lm);
      return stabilize(i, raw);
    });

    // Update hand chips (uses raw handedness labels)
    updateHandChips(handedness.length ? handedness : null, gesturesByHand);

    // Draw each hand with distinct color
    const handColors = ['#c084fc', '#38bdf8'];
    hands.forEach((lm, i) => {
      drawHand(ctxPowers, canvasPowers, lm, gesturesByHand[i], gesturesByHand[i] ? GESTURE_COLORS[gesturesByHand[i].id] : handColors[i % 2]);
    });

    // ── RECORDING: capture when gesture holds ──
    if (pwState === 'recording' && hands.length > 0) {
      const g = gesturesByHand[0]; // record first hand only
      if (g) {
        if (pwRecHoldId === g.id) { pwRecHoldF++; }
        else                      { pwRecHoldId = g.id; pwRecHoldF = 1; }
        if (pwRecHoldF >= PW_HOLD) {
          pwRecHoldF = 0;
          // Only capture if different from last recorded
          if (pwRecorded.length === 0 || pwRecorded[pwRecorded.length-1].id !== g.id) {
            pwCaptureGesture(g);
          }
        }
      } else {
        pwRecHoldId = null; pwRecHoldF = 0;
      }
    }

    // ── PLAYBACK: check if user does the right gesture ──
    if (pwState === 'playing') {
      const seq = pwSaved[pwSelectedSave];
      if (!seq || pwPlayIndex >= seq.gestures.length) { pwFinishPlayback(); return; }
      const target = seq.gestures[pwPlayIndex];
      const g = gesturesByHand[0];
      if (g) {
        if (pwPlayHoldId === g.id) { pwPlayHoldF++; }
        else                       { pwPlayHoldId = g.id; pwPlayHoldF = 1; }
        if (pwPlayHoldF >= PW_HOLD) {
          pwPlayHoldId = null; pwPlayHoldF = 0;
          const correct = g.id === target.id;
          pwPlayResults.push(correct);
          // Flash feedback on overlay
          pwPlayOverlay.style.background = correct
            ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)';
          setTimeout(() => pwPlayOverlay.style.background = '', 300);
          pwPlayIndex++;
          if (pwPlayIndex >= seq.gestures.length) { setTimeout(pwFinishPlayback, 400); }
          else { pwShowPlayStep(); }
        }
      } else {
        pwPlayHoldId = null; pwPlayHoldF = 0;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));
    document.querySelectorAll('.tab-content').forEach(tc=>tc.classList.toggle('active', tc.id==='tab-'+activeTab));
    // Reset buffers
    Object.keys(stableBuffers).forEach(k => stableBuffers[k]=[]);
    liveLastGesture = null;
    // Stop any power state
    if (activeTab !== 'powers' && pwState !== 'idle') {
      pwStopRecording();
      pwState = 'idle';
      pwPlayOverlay.classList.add('hidden');
    }
  });
});

// ══════════════════════════════════════════════════════════
//  MEDIAPIPE INIT — single camera + single Hands instance
// ══════════════════════════════════════════════════════════
function initMediaPipe() {
  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({
    maxNumHands:            2,      // 2 for powers tab
    modelComplexity:        1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence:  0.55,
  });
  hands.onResults(onResults);

  const camera = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }); },
    width: 1280, height: 720,
  });

  camera.start().then(() => {
    statusDot.classList.add('active');
    statusText.textContent = 'النظام يعمل ✓';
    // Push live video stream to all canvases via drawImage for background
    function drawBg() {
      const tabs = [
        { active:'live',      cv:canvasLive,      c:ctxLive      },
        { active:'challenge', cv:canvasChallenge, c:ctxChallenge },
        { active:'powers',    cv:canvasPowers,    c:ctxPowers    },
      ];
      tabs.forEach(t => {
        if (activeTab !== t.active) return;
        const cv = t.cv, c = t.c;
        if (cv.width && cv.height && videoEl.readyState >= 2) {
          // draw mirrored background
          c.save();
          c.scale(-1,1);
          c.drawImage(videoEl, -cv.width, 0, cv.width, cv.height);
          c.restore();
        }
      });
      requestAnimationFrame(drawBg);
    }
    drawBg();
  }).catch(err => {
    statusText.textContent = 'خطأ: ' + err.message;
    console.error(err);
  });
}

// ══════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════
setInterval(() => {
  clockDisplay.textContent = new Date().toLocaleTimeString('en',{hour12:false});
}, 1000);

// ══════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  initCardColors();
  initMediaPipe();
});
