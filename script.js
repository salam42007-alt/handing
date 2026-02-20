// =========================================================
//  NEUROHAND v4.0
//
//  KEY DESIGN:
//  - ONE <video> with visibility:hidden  →  camera always ON
//  - ONE <canvas> that draws: camera frame (mirrored) + skeleton
//  - Tabs only switch which overlays/panel are visible
//  - NO second camera, NO second canvas, NO drawImage conflicts
// =========================================================

// ── Skeleton connections ───────────────────────────────────
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],[5,9],[9,13],[13,17],
];

const LM = {
  WRIST:0,
  THUMB_CMC:1,THUMB_MCP:2,THUMB_IP:3,THUMB_TIP:4,
  INDEX_MCP:5,INDEX_PIP:6,INDEX_DIP:7,INDEX_TIP:8,
  MIDDLE_MCP:9,MIDDLE_PIP:10,MIDDLE_DIP:11,MIDDLE_TIP:12,
  RING_MCP:13,RING_PIP:14,RING_DIP:15,RING_TIP:16,
  PINKY_MCP:17,PINKY_PIP:18,PINKY_DIP:19,PINKY_TIP:20,
};

const G_COLORS = {
  thumb_up:'#4ade80', peace:'#38bdf8', open_hand:'#fb923c',
  gun:'#f472b6', three_fingers:'#c084fc',
};

// ── DOM ────────────────────────────────────────────────────
const vid         = document.getElementById('vid');
const cv          = document.getElementById('cv');
const cx          = cv.getContext('2d');
const statusDot   = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const fpsEl       = document.getElementById('fps-el');
const clockEl     = document.getElementById('clock-el');
// live
const gbadge      = document.getElementById('gesture-badge');
const gbEmoji     = document.getElementById('gb-emoji');
const gbLabel     = document.getElementById('gb-label');
const gbName      = document.getElementById('gb-name');
const ringP       = document.getElementById('ring-p');
const handCountEl = document.getElementById('hand-count');
const lmCountEl   = document.getElementById('lm-count');
const gStateEl    = document.getElementById('g-state');
const logEl       = document.getElementById('log');
const logBadge    = document.getElementById('log-count');
// challenge
const chTarget    = document.getElementById('ch-target');
const chTEmoji    = document.getElementById('ch-t-emoji');
const chTName     = document.getElementById('ch-t-name');
const chDEmoji    = document.getElementById('ch-d-emoji');
const chDName     = document.getElementById('ch-d-name');
const chTimerBar  = document.getElementById('ch-timer-bar');
const chTimerNum  = document.getElementById('ch-timer-num');
const chFlash     = document.getElementById('ch-flash');
const chSeqEl     = document.getElementById('ch-seq');
const chHistEl    = document.getElementById('ch-hist');
const chScoreEl   = document.getElementById('ch-score');
const chComboEl   = document.getElementById('ch-combo');
const chStreakEl  = document.getElementById('ch-streak');
const chLvlBadge  = document.getElementById('ch-lvl-badge');
const chReqEl     = document.getElementById('ch-req');
const chStarsEl   = document.getElementById('ch-stars');
const chStartBtn  = document.getElementById('ch-start');
const chResetBtn  = document.getElementById('ch-reset');
// powers
const pwRight     = document.getElementById('pw-right');
const pwLeft      = document.getElementById('pw-left');
const pwRecInd    = document.getElementById('pw-rec-ind');
const pwBarWrap   = document.getElementById('pw-bar-wrap');
const pwBarFill   = document.getElementById('pw-bar-fill');
const pwBarLbl    = document.getElementById('pw-bar-lbl');
const pwCd        = document.getElementById('pw-cd');
const pwCdN       = document.getElementById('pw-cd-n');
const pwCdS       = document.getElementById('pw-cd-s');
const pwPlayOv    = document.getElementById('pw-play-ov');
const pwPe        = document.getElementById('pw-pe');
const pwPn        = document.getElementById('pw-pn');
const pwProg      = document.getElementById('pw-prog');
const pwBadge     = document.getElementById('pw-badge');
const pwNameInput = document.getElementById('pw-name');
const pwPreview   = document.getElementById('pw-preview');
const pwBtnStart  = document.getElementById('pw-btn-start');
const pwBtnStop   = document.getElementById('pw-btn-stop');
const pwBtnClear  = document.getElementById('pw-btn-clear');
const pwBtnSave   = document.getElementById('pw-btn-save');
const pwBtnPlay   = document.getElementById('pw-btn-play');
const pwSavedList = document.getElementById('pw-saved-list');
const pwSavedCount= document.getElementById('pw-saved-count');
const pwResult    = document.getElementById('pw-result');
const pwOk        = document.getElementById('pw-ok');
const pwErr       = document.getElementById('pw-err');
const pwAcc       = document.getElementById('pw-acc');
const pwSteps     = document.getElementById('pw-steps');
const pwRecSec    = document.getElementById('pw-rec-sec');
const pwPlaySec   = document.getElementById('pw-play-sec');
const camBox      = document.getElementById('cam-box');

// ── State ──────────────────────────────────────────────────
let activeTab = 'live';
let fpsF = 0, lastFpsT = performance.now();
const RING_C = 2 * Math.PI * 44;

// ═══════════════════════════════════════════
//  GESTURE DETECTION
// ═══════════════════════════════════════════
function isUp(lm,tip,pip)  { return lm[tip].y < lm[pip].y - 0.04; }
function isDown(lm,tip,mcp){ return lm[tip].y > lm[mcp].y - 0.01; }
function isThumbOut(lm) {
  const tx=lm[LM.THUMB_TIP].x,mx=lm[LM.THUMB_MCP].x,wx=lm[LM.WRIST].x;
  return Math.abs(tx-wx)>Math.abs(mx-wx)+0.04 ||
        (lm[LM.THUMB_TIP].y<lm[LM.THUMB_IP].y-0.02 && lm[LM.THUMB_IP].y<lm[LM.THUMB_MCP].y);
}
const fi = lm=>({
  th:isThumbOut(lm),
  i:isUp(lm,LM.INDEX_TIP,LM.INDEX_PIP),
  m:isUp(lm,LM.MIDDLE_TIP,LM.MIDDLE_PIP),
  r:isUp(lm,LM.RING_TIP,LM.RING_PIP),
  p:isUp(lm,LM.PINKY_TIP,LM.PINKY_PIP),
});
const detectors = {
  open_hand:     lm => { const g=fi(lm); return g.th&&g.i&&g.m&&g.r&&g.p; },
  three_fingers: lm => { const g=fi(lm); return g.th&&g.i&&g.m&&isDown(lm,LM.RING_TIP,LM.RING_MCP)&&isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); },
  peace:         lm => { const g=fi(lm); return !g.th&&g.i&&g.m&&isDown(lm,LM.RING_TIP,LM.RING_MCP)&&isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); },
  gun:           lm => { const g=fi(lm); return g.th&&g.i&&isDown(lm,LM.MIDDLE_TIP,LM.MIDDLE_MCP)&&isDown(lm,LM.RING_TIP,LM.RING_MCP)&&isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); },
  thumb_up:      lm => { const g=fi(lm); return g.th&&isDown(lm,LM.INDEX_TIP,LM.INDEX_MCP)&&isDown(lm,LM.MIDDLE_TIP,LM.MIDDLE_MCP)&&isDown(lm,LM.RING_TIP,LM.RING_MCP)&&isDown(lm,LM.PINKY_TIP,LM.PINKY_MCP); },
};
const GESTURES = [
  {id:'open_hand',    label:'السلام',      emoji:'🖐️'},
  {id:'three_fingers',label:'ثلاثة أصابع', emoji:'🤟'},
  {id:'peace',        label:'علامة النصر', emoji:'✌️'},
  {id:'gun',          label:'إبهام وسبابة',emoji:'🤙'},
  {id:'thumb_up',     label:'إبهام لأعلى',emoji:'👍'},
];
function recognize(lm) {
  for (const g of GESTURES) if (detectors[g.id](lm)) return g;
  return null;
}

// Stability: gesture must hold for N frames straight
const STABLE_N = 5;
const stBufs = {};
function stabilize(key, raw) {
  if (!stBufs[key]) stBufs[key] = [];
  const id = raw ? raw.id : null;
  stBufs[key].push(id);
  if (stBufs[key].length > STABLE_N) stBufs[key].shift();
  if (stBufs[key].length < STABLE_N) return null;
  return stBufs[key].every(x => x === id) ? raw : null;
}

// ═══════════════════════════════════════════
//  DRAWING — camera frame + skeleton on ONE canvas
// ═══════════════════════════════════════════
const TIPS = new Set([4,8,12,16,20]);

function drawFrame(videoEl, landmarks, handedness) {
  // Sync canvas size to its displayed size
  const W = cv.offsetWidth, H = cv.offsetHeight;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }

  // 1) Draw mirrored camera frame
  cx.save();
  cx.scale(-1, 1);
  cx.drawImage(videoEl, -W, 0, W, H);
  cx.restore();

  // 2) Draw skeleton for each hand
  if (!landmarks) return;
  landmarks.forEach((lm, idx) => {
    const gest = recognize(lm);
    const col  = gest ? (G_COLORS[gest.id]||'#4ade80') : (idx===0 ? '#c084fc' : '#38bdf8');

    // lines
    cx.strokeStyle = col; cx.lineWidth = 2.8; cx.lineCap = 'round'; cx.lineJoin = 'round';
    for (const [a,b] of HAND_CONNECTIONS) {
      cx.beginPath();
      // landmarks are in 0-1 range; mirror by doing (1 - x)
      cx.moveTo((1-lm[a].x)*W, lm[a].y*H);
      cx.lineTo((1-lm[b].x)*W, lm[b].y*H);
      cx.stroke();
    }
    // dots
    for (let i=0; i<lm.length; i++) {
      const x=(1-lm[i].x)*W, y=lm[i].y*H;
      const tip=TIPS.has(i), r=tip?8:4.5;
      if (tip) {
        cx.beginPath(); cx.arc(x,y,r+6,0,Math.PI*2);
        cx.fillStyle=col+'25'; cx.fill();
      }
      cx.beginPath(); cx.arc(x,y,r,0,Math.PI*2);
      cx.fillStyle=tip?col:'rgba(215,240,255,0.9)'; cx.fill();
      if (tip) {
        cx.beginPath(); cx.arc(x-1.5,y-1.5,r*.28,0,Math.PI*2);
        cx.fillStyle='rgba(255,255,255,0.75)'; cx.fill();
      }
    }
  });
}

// ═══════════════════════════════════════════
//  LIVE TAB
// ═══════════════════════════════════════════
let liveLastId = null, liveLogN = 0;

function initCards() {
  document.querySelectorAll('.gc').forEach(c => c.style.setProperty('--card-color', c.dataset.color||'#c084fc'));
}
function setRing(ratio, col) {
  ringP.style.strokeDashoffset = RING_C*(1-ratio);
  ringP.style.stroke = col;
}
function updateLive(g) {
  if (!g) {
    if (liveLastId !== null) {
      gbadge.className=''; gbEmoji.textContent='✋'; gbLabel.textContent='في انتظار';
      gbName.textContent='الإيماءة'; gbName.style.color='var(--mu)';
      setRing(0,'#334155');
      document.querySelectorAll('.gc').forEach(c=>c.classList.remove('active'));
      gStateEl.textContent='--'; liveLastId=null;
    }
    return;
  }
  if (g.id !== liveLastId) {
    const col=G_COLORS[g.id]||'#c084fc';
    gbEmoji.textContent=g.emoji; gbLabel.textContent='تم التعرف على';
    gbName.textContent=g.label; gbName.style.color=col;
    gbadge.className=g.id; gStateEl.textContent=g.label;
    setRing(1,col);
    gbadge.classList.remove('pop'); void gbadge.offsetWidth; gbadge.classList.add('pop');
    document.querySelectorAll('.gc').forEach(c=>c.classList.toggle('active',c.dataset.id===g.id));
    // log entry
    liveLogN++; logBadge.textContent=liveLogN;
    const t=new Date().toLocaleTimeString('en',{hour12:false});
    const el=document.createElement('div'); el.className='le';
    el.innerHTML=`<span>${g.emoji}</span><span>${g.label}</span><span>${t}</span>`;
    logEl.prepend(el); if(logEl.children.length>25)logEl.removeChild(logEl.lastChild);
    liveLastId=g.id;
  }
}

// ═══════════════════════════════════════════
//  CHALLENGE TAB
// ═══════════════════════════════════════════
let chRun=false,chLvl=1,chScore=0,chStreak=0,chCombo=1;
let chSeq=[],chCur=0,chTime=10,chTimer=null,chHoldId=null,chHoldF=0;
const CH_HOLD=10;

function chNumG(l){ return Math.min(l+1,6); }
function chBuild(n){
  const r=[]; let last=null;
  for(let i=0;i<n;i++){
    let p; do{p=GESTURES[Math.floor(Math.random()*GESTURES.length)]}while(p===last);
    r.push(p); last=p;
  }
  return r;
}
function chRenderSeq(){
  chSeqEl.innerHTML='';
  chSeq.forEach((g,i)=>{
    const d=document.createElement('div');
    d.className='si '+(i<chCur?'done':i===chCur?'cur':'pend');
    d.textContent=g.emoji; chSeqEl.appendChild(d);
  });
}
function chShowTgt(){
  const g=chSeq[chCur]; if(!g)return;
  chTEmoji.textContent=g.emoji; chTName.textContent=g.label;
  chTarget.classList.remove('ok');
}
function chMatch(){
  chTarget.classList.add('ok');
  chFlash.classList.add('on'); setTimeout(()=>chFlash.classList.remove('on'),170);
  const pts=(100+Math.floor(chTime*10))*chCombo;
  chScore+=pts; chStreak++; chCombo=Math.min(1+Math.floor(chStreak/2),5);
  chScoreEl.textContent=chScore; chComboEl.textContent='x'+chCombo; chStreakEl.textContent=chStreak;
  // popup
  const rect=chTarget.getBoundingClientRect();
  const pop=document.createElement('div'); pop.className='spop';
  pop.textContent='+'+pts; pop.style.left=(rect.left+rect.width/2-20)+'px'; pop.style.top=rect.top+'px';
  document.body.appendChild(pop); setTimeout(()=>pop.remove(),1200);
  // advance
  const items=chSeqEl.querySelectorAll('.si');
  if(items[chCur])items[chCur].className='si done';
  chCur++;
  if(chCur>=chSeq.length){clearInterval(chTimer);setTimeout(chLvlDone,420);}
  else{chTime=10;chUpdateTimer();chShowTgt();chRenderSeq();}
}
function chTick(){
  if(!chRun)return;
  chTime=Math.max(0,chTime-1); chUpdateTimer();
  if(chTime===0){
    chStreak=0;chCombo=1;chComboEl.textContent='x1';chStreakEl.textContent='0';
    const items=chSeqEl.querySelectorAll('.si');
    if(items[chCur]){items[chCur].className='si fail';setTimeout(()=>{const e=chSeqEl.querySelectorAll('.si')[chCur];if(e)e.className='si cur';},500);}
    chTime=10;chUpdateTimer();chHoldId=null;chHoldF=0;
  }
}
function chUpdateTimer(){
  chTimerBar.style.width=(chTime/10*100)+'%';
  chTimerNum.textContent=chTime;
  chTimerBar.classList.toggle('red',chTime<=3);
}
function chEarnStars(n){ chStarsEl.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<n)); }
function chLvlDone(){
  chRun=false;clearInterval(chTimer);
  chEarnStars(Math.min(5,Math.max(1,Math.ceil(chStreak/1.5))));
  const row=document.createElement('div');row.className='chr';
  row.innerHTML=`<span class="chl">L${chLvl}</span><span style="flex:1">مكتمل ✓</span><span class="chs">${chScore}</span>`;
  chHistEl.prepend(row);
  chLvl++;chLvlBadge.textContent=chLvl;chReqEl.textContent=chNumG(chLvl);
  chStartBtn.textContent='▶ المستوى '+chLvl;chStartBtn.disabled=false;
}
function chDoStart(){
  chSeq=chBuild(chNumG(chLvl));chCur=0;chHoldId=null;chHoldF=0;
  chReqEl.textContent=chSeq.length;chLvlBadge.textContent=chLvl;
  chStartBtn.disabled=true;chStartBtn.textContent='⏳ جاري...';
  chEarnStars(0);chRenderSeq();chShowTgt();chTime=10;chUpdateTimer();
  showCd(camBox,()=>{chRun=true;clearInterval(chTimer);chTimer=setInterval(chTick,1000);});
}
function chDoReset(){
  clearInterval(chTimer);chRun=false;chLvl=1;chScore=0;chStreak=0;chCombo=1;
  chSeq=[];chCur=0;chHoldId=null;chHoldF=0;
  chScoreEl.textContent='0';chComboEl.textContent='x1';chStreakEl.textContent='0';
  chLvlBadge.textContent='1';chReqEl.textContent='2';
  chStartBtn.textContent='▶ ابدأ التحدي';chStartBtn.disabled=false;
  chTimerBar.style.width='100%';chTimerNum.textContent='10';chTimerBar.classList.remove('red');
  chTEmoji.textContent='🎯';chTName.textContent='اضغط ابدأ';
  chSeqEl.innerHTML='';chHistEl.innerHTML='';chEarnStars(0);
}
chStartBtn.addEventListener('click',chDoStart);
chResetBtn.addEventListener('click',chDoReset);

// countdown helper
function showCd(wrap,cb){
  const ov=document.createElement('div');ov.className='cd-ov';
  const nd=document.createElement('div');nd.className='cdn';
  const sd=document.createElement('div');sd.className='cds';
  ov.appendChild(nd);ov.appendChild(sd);wrap.appendChild(ov);
  let n=3;
  function tick(){
    nd.textContent=n===0?'GO!':n;sd.textContent=n===0?'':'استعد...';
    nd.style.animation='none';void nd.offsetWidth;nd.style.animation='cpop .62s cubic-bezier(.34,1.56,.64,1) forwards';
    n--;
    if(n<0)setTimeout(()=>{ov.remove();cb();},620);
    else setTimeout(tick,880);
  }
  tick();
}

// ═══════════════════════════════════════════
//  POWERS TAB
// ═══════════════════════════════════════════
const MAX_REC=20, PW_HOLD=12;
let pwState='idle';
let pwRecorded=[], pwSaved=[], pwSelIdx=-1;
let pwPlayIdx=0, pwPlayResults=[];
let pwHoldId=null, pwHoldF=0;
let pwMode='rec';

// recording
function pwStartCd(){
  if(pwState!=='idle')return;
  pwState='countdown';pwBtnStart.disabled=true;
  pwCd.classList.remove('hidden');
  let n=3;
  function tick(){
    pwCdN.textContent=n;pwCdS.textContent=n>0?'استعد...':'سجّل!';
    pwCdN.style.animation='none';void pwCdN.offsetWidth;pwCdN.style.animation='cpop .6s cubic-bezier(.34,1.56,.64,1) forwards';
    n--;
    if(n<0){pwCd.classList.add('hidden');pwBeginRec();}
    else setTimeout(tick,900);
  }
  tick();
}
function pwBeginRec(){
  pwState='recording';pwHoldId=null;pwHoldF=0;
  pwRecInd.classList.remove('hidden');pwBarWrap.classList.remove('hidden');
  pwBtnStop.disabled=false;pwUpdateBar();
}
function pwStopRec(){
  if(pwState!=='recording')return;
  pwState='idle';pwRecInd.classList.add('hidden');pwBarWrap.classList.add('hidden');
  pwBtnStart.disabled=false;pwBtnStop.disabled=true;
  pwBtnSave.disabled=pwRecorded.length===0;
}
function pwCapture(g){
  if(pwRecorded.length>=MAX_REC){pwStopRec();return;}
  pwRecorded.push(g);
  const c=document.createElement('div');c.className='pwc';c.textContent=g.emoji;c.title=g.label;
  pwPreview.appendChild(c);pwUpdateBar();
  if(pwRecorded.length>=MAX_REC)pwStopRec();
}
function pwUpdateBar(){
  pwBarFill.style.width=(pwRecorded.length/MAX_REC*100)+'%';
  pwBarLbl.textContent=pwRecorded.length+'/20';
  pwBadge.textContent=pwRecorded.length+'/20';
}
function pwClear(){
  pwRecorded=[];pwPreview.innerHTML='';pwBtnSave.disabled=true;pwUpdateBar();
}
function pwSave(){
  if(!pwRecorded.length)return;
  const name=pwNameInput.value.trim()||('تسلسل '+(pwSaved.length+1));
  pwSaved.push({name,gestures:[...pwRecorded]});
  pwNameInput.value='';pwClear();pwRenderSaved();
}
pwBtnStart.addEventListener('click',pwStartCd);
pwBtnStop.addEventListener('click',pwStopRec);
pwBtnClear.addEventListener('click',pwClear);
pwBtnSave.addEventListener('click',pwSave);

// saved list
function pwRenderSaved(){
  pwSavedList.innerHTML='';pwSavedCount.textContent=pwSaved.length;
  pwBtnPlay.disabled=pwSelIdx<0||pwSelIdx>=pwSaved.length;
  pwSaved.forEach((s,i)=>{
    const card=document.createElement('div');card.className='pwcard'+(i===pwSelIdx?' sel':'');
    card.innerHTML=`<div style="flex:1;min-width:0"><div class="pwcn">${s.name}</div><div class="pwce">${s.gestures.map(g=>g.emoji).join(' ')}</div></div><div class="pwcc">${s.gestures.length} حركة</div><button class="pwdel" data-i="${i}">🗑</button>`;
    card.addEventListener('click',e=>{
      if(e.target.classList.contains('pwdel'))return;
      pwSelIdx=i;pwRenderSaved();pwResult.classList.add('hidden');
    });
    card.querySelector('.pwdel').addEventListener('click',()=>{
      pwSaved.splice(i,1);if(pwSelIdx>=pwSaved.length)pwSelIdx=pwSaved.length-1;pwRenderSaved();
    });
    pwSavedList.appendChild(card);
  });
}

// playback
function pwStartPlay(){
  if(pwSelIdx<0||pwSelIdx>=pwSaved.length||pwState!=='idle')return;
  pwPlayIdx=0;pwHoldId=null;pwHoldF=0;pwPlayResults=[];
  pwState='playing';pwResult.classList.add('hidden');
  pwShowStep();
}
function pwShowStep(){
  const seq=pwSaved[pwSelIdx];
  if(!seq||pwPlayIdx>=seq.gestures.length){pwFinish();return;}
  const g=seq.gestures[pwPlayIdx];
  pwPe.textContent=g.emoji;pwPn.textContent=g.label;
  pwProg.style.width='0%';pwPlayOv.classList.remove('hidden');
}
function pwFinish(){
  pwState='idle';pwPlayOv.classList.add('hidden');
  const ok=pwPlayResults.filter(Boolean).length,total=pwPlayResults.length,err=total-ok;
  pwOk.textContent=ok;pwErr.textContent=err;pwAcc.textContent=(total?Math.round(ok/total*100):0)+'%';
  const seq=pwSaved[pwSelIdx];pwSteps.innerHTML='';
  pwPlayResults.forEach((good,i)=>{
    const chip=document.createElement('div');chip.className='pstep '+(good?'ok':'err');
    chip.textContent=(seq.gestures[i]?.emoji||'?')+(good?' ✓':' ✗');pwSteps.appendChild(chip);
  });
  pwResult.classList.remove('hidden');
}
pwBtnPlay.addEventListener('click',pwStartPlay);

// mode switch
document.querySelectorAll('.ptab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    pwMode=btn.dataset.m;
    document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b===btn));
    pwRecSec.classList.toggle('hidden',pwMode!=='rec');
    pwPlaySec.classList.toggle('hidden',pwMode!=='play');
    if(pwMode==='play')pwRenderSaved();
  });
});

// ═══════════════════════════════════════════
//  MEDIAPIPE RESULT HANDLER
// ═══════════════════════════════════════════
function onResults(results) {
  // FPS
  fpsF++;
  const now=performance.now();
  if(now-lastFpsT>=1000){fpsEl.textContent=fpsF+' FPS';fpsF=0;lastFpsT=now;}

  const hands    = results.multiHandLandmarks||[];
  const handness = results.multiHandedness   ||[];

  // Draw camera + skeleton (always, regardless of tab)
  drawFrame(vid, hands, handness);

  // ── LIVE ──
  if(activeTab==='live'){
    handCountEl.textContent=hands.length;
    lmCountEl.textContent=hands.length?hands[0].length+'/21':'--';
    if(!hands.length){stBufs.live=[];updateLive(null);return;}
    const st=stabilize('live',recognize(hands[0]));
    updateLive(st);
    return;
  }

  // ── CHALLENGE ──
  if(activeTab==='challenge'){
    if(!hands.length){chDEmoji.textContent='✋';chDName.textContent='--';chHoldId=null;chHoldF=0;return;}
    const raw=recognize(hands[0]);
    chDEmoji.textContent=raw?raw.emoji:'✋';chDName.textContent=raw?raw.label:'--';
    if(chRun&&chSeq[chCur]){
      const tgt=chSeq[chCur];
      if(raw&&raw.id===tgt.id){
        if(chHoldId===raw.id)chHoldF++;else{chHoldId=raw.id;chHoldF=1;}
        if(chHoldF>=CH_HOLD){chHoldId=null;chHoldF=0;chMatch();}
      }else{chHoldId=null;chHoldF=0;chTarget.classList.remove('ok');}
    }
    return;
  }

  // ── POWERS ──
  if(activeTab==='powers'){
    // Update hand chips
    [pwRight,pwLeft].forEach(el=>{el.textContent='--';el.classList.remove('on');});
    handness.forEach((h,i)=>{
      const el=h.label==='Right'?pwRight:pwLeft;
      const g=stabilize(i,recognize(hands[i]));
      el.textContent=g?g.emoji+' '+g.label:'🤚 مكتشف';el.classList.add('on');
    });

    // Recording (first hand)
    if(pwState==='recording'&&hands.length>0){
      const g=stabilize('pw0',recognize(hands[0]));
      if(g){
        if(pwHoldId===g.id)pwHoldF++;else{pwHoldId=g.id;pwHoldF=1;}
        if(pwHoldF>=PW_HOLD){
          pwHoldF=0;
          if(!pwRecorded.length||pwRecorded[pwRecorded.length-1].id!==g.id)pwCapture(g);
        }
      }else{pwHoldId=null;pwHoldF=0;}
    }

    // Playback (first hand)
    if(pwState==='playing'){
      const seq=pwSaved[pwSelIdx];
      if(!seq||pwPlayIdx>=seq.gestures.length){pwFinish();return;}
      const tgt=seq.gestures[pwPlayIdx];
      const g=hands.length?stabilize('pw0',recognize(hands[0])):null;
      if(g){
        if(pwHoldId===g.id)pwHoldF++;else{pwHoldId=g.id;pwHoldF=1;}
        pwProg.style.width=Math.min(100,pwHoldF/PW_HOLD*100)+'%';
        if(pwHoldF>=PW_HOLD){
          pwHoldId=null;pwHoldF=0;
          const ok=g.id===tgt.id;
          pwPlayResults.push(ok);
          pwPlayOv.style.background=ok?'rgba(74,222,128,0.16)':'rgba(239,68,68,0.16)';
          setTimeout(()=>pwPlayOv.style.background='',320);
          pwPlayIdx++;
          if(pwPlayIdx>=seq.gestures.length)setTimeout(pwFinish,420);
          else pwShowStep();
        }
      }else{pwHoldF=0;pwProg.style.width='0%';}
    }
  }
}

// ═══════════════════════════════════════════
//  TAB SWITCHING
// ═══════════════════════════════════════════
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeTab=btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));
    // panels
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+activeTab));
    // overlays on cam
    document.querySelectorAll('.tab-ov').forEach(o=>o.classList.toggle('active',o.id==='ov-'+activeTab));
    // clear buffers
    Object.keys(stBufs).forEach(k=>stBufs[k]=[]);
    liveLastId=null;
    // stop power activities if leaving powers
    if(activeTab!=='powers'){
      if(pwState==='recording')pwStopRec();
      if(pwState==='playing'){pwState='idle';pwPlayOv.classList.add('hidden');}
    }
  });
});

// ═══════════════════════════════════════════
//  INIT — single Camera, single Hands
// ═══════════════════════════════════════════
function init(){
  const hands=new Hands({
    locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({
    maxNumHands:2,
    modelComplexity:1,
    minDetectionConfidence:0.65,
    minTrackingConfidence:0.55,
  });
  hands.onResults(onResults);

  const camera=new Camera(vid,{
    onFrame:async()=>{ await hands.send({image:vid}); },
    width:1280, height:720,
  });
  camera.start().then(()=>{
    statusDot.classList.add('on');
    statusText.textContent='النظام يعمل ✓';
  }).catch(err=>{
    statusText.textContent='خطأ: '+err.message;
    console.error(err);
  });
}

// clock
setInterval(()=>{ clockEl.textContent=new Date().toLocaleTimeString('en',{hour12:false}); },1000);

window.addEventListener('load',()=>{ initCards(); init(); });
