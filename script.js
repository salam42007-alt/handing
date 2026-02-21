// ═══════════════════════════════════════════════════════════
//  NEUROHAND v8.0 — خوارزمية كشف مُعاد بناؤها كلياً
//
//  المشكلة القديمة: التصويت البسيط كان يعطي نتائج خاطئة
//  لأن شروطه غير مستقلة وتتأثر ببعضها
//
//  الحل الجديد: نقيس زاوية كل مفصل بشكل مستقل ثم نحكم
//  ─────────────────────────────────────────────────────────
//  لكل إصبع نقيس زاويتين:
//    • زاوية MCP  : الانحناء عند قاعدة الإصبع
//    • زاوية PIP  : الانحناء عند المنتصف
//  الإصبع "ممتد" إذا كلتا الزاويتين > عتبة كبيرة
//  الإصبع "منطوٍ" إذا إحداهما على الأقل < عتبة صغيرة
//
//  للإبهام: نقيس الزاوية الجانبية لأن حركته مختلفة
//
//  إضافةً لذلك: تنعيم EMA + بافر ثقة مزدوج
// ═══════════════════════════════════════════════════════════
'use strict';

/* ─── وصلات الهيكل ─────────────────────────────────────── */
const CONNECTIONS=[
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],[5,9],[9,13],[13,17],
];

/* ─── مسافة ثلاثية الأبعاد ─────────────────────────────── */
function dist(a,b){
  const dx=a.x-b.x, dy=a.y-b.y, dz=(a.z||0)-(b.z||0);
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

/* ─── زاوية عند نقطة B (A–B–C) بالدرجات ───────────────── */
function ang(A,B,C){
  const ax=A.x-B.x, ay=A.y-B.y, az=(A.z||0)-(B.z||0);
  const cx=C.x-B.x, cy=C.y-B.y, cz=(C.z||0)-(B.z||0);
  const dot=ax*cx+ay*cy+az*cz;
  const m=Math.sqrt(ax*ax+ay*ay+az*az)*Math.sqrt(cx*cx+cy*cy+cz*cz);
  return m<1e-8 ? 0 : Math.acos(Math.max(-1,Math.min(1,dot/m)))*180/Math.PI;
}

/* ═══════════════════════════════════════════════════════════
   نظام كشف الأصابع المُعاد بناؤه

   نقيس زوايا ثلاثة مفاصل لكل إصبع:
     MCP_ang = زاوية عند القاعدة   (WRIST–MCP–PIP)
     PIP_ang = زاوية عند الوسط    (MCP–PIP–DIP)
     DIP_ang = زاوية عند الطرف   (PIP–DIP–TIP)

   الإصبع ممتد إذا: مجموع الانحناءات < عتبة
   (كلما اقتربت الزاوية من 180° كلما كان الإصبع مستقيماً)

   الانحناء = 180 - زاوية_المفصل
   (صفر = مستقيم تماماً، 90 = منحنٍ 90°)
═══════════════════════════════════════════════════════════ */

// مجموع انحناء المفاصل الثلاثة — صغير = ممتد، كبير = منطوٍ
function fingerCurl(lm, TIP, DIP, PIP, MCP, WRIST){
  const a1 = 180 - ang(lm[WRIST], lm[MCP],  lm[PIP]);  // MCP curl
  const a2 = 180 - ang(lm[MCP],   lm[PIP],  lm[DIP]);  // PIP curl
  const a3 = 180 - ang(lm[PIP],   lm[DIP],  lm[TIP]);  // DIP curl
  return a1 + a2 + a3; // عادةً 0..270
}

// عتبات الكشف — جُرِّبت لتعطي أفضل دقة
const EXT_THRESH  = 80;  // أقل من هذا = ممتد
const CURL_THRESH = 140; // أكثر من هذا = منطوٍ بوضوح

function isExt(lm,TIP,DIP,PIP,MCP,WRIST){
  return fingerCurl(lm,TIP,DIP,PIP,MCP,WRIST) < EXT_THRESH;
}

/* ─── الإبهام: معالجة خاصة ─────────────────────────────
   الإبهام يتحرك جانبياً وليس للأعلى/الأسفل
   نقيس:
   1. زاوية التمديد: CMC–MCP–TIP
   2. بُعد TIP عن السبابة DIP نسبةً لحجم اليد
   3. الإبهام مرفوع: TIP.y أعلى من IP.y
──────────────────────────────────────────────────────── */
function isThumbExt(lm){
  const scale = dist(lm[0], lm[9]); // مقياس = رسغ→وسطى
  // زاوية التمديد: كلما اقتربت من 180 = ممتد
  const extAng = ang(lm[1], lm[2], lm[4]); // CMC–MCP–TIP
  // بُعد طرف الإبهام عن مفصل السبابة
  const lateralDist = dist(lm[4], lm[5]) / scale;
  // ارتفاع الإبهام: TIP أعلى من IP
  const tipHigh = lm[4].y < lm[3].y;
  // انحناء المفصل الوسيط للإبهام
  const ipCurl = 180 - ang(lm[2], lm[3], lm[4]);

  // يُعتبر ممتداً إذا:
  // (زاوية جيدة) أو (بُعد جانبي كافٍ) أو (مرتفع مع انحناء منخفض)
  return extAng > 160 || lateralDist > 0.9 || (tipHigh && ipCurl < 50);
}

/* ─── حالة كل الأصابع الخمسة ──────────────────────────── */
function getF(lm){
  return {
    th: isThumbExt(lm),
    i:  isExt(lm, 8, 7, 6, 5, 0),
    m:  isExt(lm,12,11,10, 9, 0),
    r:  isExt(lm,16,15,14,13, 0),
    k:  isExt(lm,20,19,18,17, 0),
  };
}

/* ─── عدد الأصابع الممتدة ─────────────────────────────── */
function countExt(f){ return [f.th,f.i,f.m,f.r,f.k].filter(Boolean).length; }

/* ─── تعريف الإيماءات ─────────────────────────────────── */
const GESTURES=[
  { id:'open_hand',    label:'السلام',       emoji:'🖐️', color:'#fb923c',
    det:lm=>{const f=getF(lm);return f.th&&f.i&&f.m&&f.r&&f.k;} },
  { id:'four_fingers', label:'أربعة أصابع',  emoji:'🤘', color:'#f472b6',
    det:lm=>{const f=getF(lm);return !f.th&&f.i&&f.m&&f.r&&f.k;} },
  { id:'three_fingers',label:'ثلاثة أصابع', emoji:'🤟', color:'#c084fc',
    det:lm=>{const f=getF(lm);return f.th&&f.i&&f.m&&!f.r&&!f.k;} },
  { id:'peace',        label:'علامة النصر',  emoji:'✌️', color:'#38bdf8',
    det:lm=>{const f=getF(lm);return !f.th&&f.i&&f.m&&!f.r&&!f.k;} },
  { id:'gun',          label:'إبهام وسبابة', emoji:'🤙', color:'#f472b6',
    det:lm=>{const f=getF(lm);return f.th&&f.i&&!f.m&&!f.r&&!f.k;} },
  { id:'thumb_up',     label:'إبهام لأعلى',  emoji:'👍', color:'#4ade80',
    det:lm=>{const f=getF(lm);return f.th&&!f.i&&!f.m&&!f.r&&!f.k;} },
  { id:'index_only',   label:'سبابة فقط',    emoji:'☝️', color:'#fbbf24',
    det:lm=>{const f=getF(lm);return !f.th&&f.i&&!f.m&&!f.r&&!f.k;} },
  { id:'fist',         label:'قبضة',          emoji:'✊', color:'#94a3b8',
    det:lm=>{const f=getF(lm);return !f.th&&!f.i&&!f.m&&!f.r&&!f.k;} },
];
const G_COL=Object.fromEntries(GESTURES.map(g=>[g.id,g.color]));

function recognize(lm){ for(const g of GESTURES) if(g.det(lm)) return g; return null; }

/* ═══════════════════════════════════════════════════════════
   بافر ثقة مزدوج — يمنع الوميض والتبديل السريع
   • NEED_POS: فريمات متتالية للتأكيد
   • TOL_NEG:  فريمات سلبية مسموح بها قبل الإلغاء
═══════════════════════════════════════════════════════════ */
const NEED_POS=7, TOL_NEG=5;
const CB={};
function stabilize(key,raw){
  if(!CB[key]) CB[key]={id:null,pos:0,neg:0};
  const b=CB[key], id=raw?raw.id:null;
  if(id===b.id){ b.pos=Math.min(b.pos+1,NEED_POS+6); b.neg=0; }
  else{ b.neg++; if(b.neg>=TOL_NEG){b.id=id;b.pos=1;b.neg=0;} }
  return b.pos>=NEED_POS ? raw : null;
}
function clearCB(){ Object.keys(CB).forEach(k=>CB[k]={id:null,pos:0,neg:0}); }

/* ═══════════════════════════════════════════════════════════
   تنعيم EMA على نقاط اليد — يُلغي الارتعاش البصري
   alpha أصغر = تنعيم أكثر لكن تأخر أكبر
   alpha=0.35 يعطي توازناً جيداً للرسم
═══════════════════════════════════════════════════════════ */
const EMA_DRAW=0.35; // لقسم الرسم — أكثر نعومة
const EMA_LIVE=0.50; // لباقي الأقسام — استجابة أسرع
const EM={};
function smooth(idx,lm,alpha){
  if(!EM[idx]){ EM[idx]=lm.map(p=>({x:p.x,y:p.y,z:p.z||0})); return EM[idx]; }
  const s=EM[idx];
  for(let i=0;i<21;i++){
    s[i].x+=alpha*(lm[i].x-s[i].x);
    s[i].y+=alpha*(lm[i].y-s[i].y);
    s[i].z+=alpha*((lm[i].z||0)-s[i].z);
  }
  return s;
}
function clearEM(){ Object.keys(EM).forEach(k=>delete EM[k]); }

/* ═══════════════════════════════════════════════════════════
   رسم الهيكل على الكانفاس
═══════════════════════════════════════════════════════════ */
const TIPS=new Set([4,8,12,16,20]);

function drawSkeleton(vid,cv,hands){
  const cx=cv.getContext('2d');
  const W=cv.clientWidth, H=cv.clientHeight;
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  cx.save(); cx.scale(-1,1); cx.drawImage(vid,-W,0,W,H); cx.restore();
  if(!hands.length) return;
  hands.forEach((lm,idx)=>{
    const g=recognize(lm);
    const col=g?(G_COL[g.id]||'#4ade80'):(idx===0?'#c084fc':'#38bdf8');
    cx.lineCap='round';
    for(const[a,b] of CONNECTIONS){
      const x1=(1-lm[a].x)*W, y1=lm[a].y*H;
      const x2=(1-lm[b].x)*W, y2=lm[b].y*H;
      const gr=cx.createLinearGradient(x1,y1,x2,y2);
      gr.addColorStop(0,col+'cc'); gr.addColorStop(1,col+'44');
      cx.beginPath(); cx.moveTo(x1,y1); cx.lineTo(x2,y2);
      cx.strokeStyle=gr; cx.lineWidth=2.6; cx.stroke();
    }
    for(let i=0;i<21;i++){
      const x=(1-lm[i].x)*W, y=lm[i].y*H;
      const tip=TIPS.has(i), r=tip?7:4;
      if(tip){
        const gr=cx.createRadialGradient(x,y,0,x,y,r+8);
        gr.addColorStop(0,col+'55'); gr.addColorStop(1,col+'00');
        cx.beginPath(); cx.arc(x,y,r+8,0,Math.PI*2); cx.fillStyle=gr; cx.fill();
      }
      cx.beginPath(); cx.arc(x,y,r,0,Math.PI*2);
      cx.fillStyle=tip?col:'rgba(220,240,255,.88)'; cx.fill();
      if(tip){
        cx.beginPath(); cx.arc(x-r*.32,y-r*.32,r*.25,0,Math.PI*2);
        cx.fillStyle='rgba(255,255,255,.75)'; cx.fill();
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   DOM LOADED
═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',()=>{

const vid=document.getElementById('vid');
const cv =document.getElementById('cv');
const dcv=document.getElementById('draw-cv');

// refs
const gbadge    =document.getElementById('gesture-badge');
const gbEmoji   =document.getElementById('gb-emoji');
const gbLabel   =document.getElementById('gb-label');
const gbName    =document.getElementById('gb-name');
const ringP     =document.getElementById('ring-p');
const handCountEl=document.getElementById('hand-count');
const gStateEl  =document.getElementById('g-state');
const logEl     =document.getElementById('log');
const logBadge  =document.getElementById('log-count');
const chTarget  =document.getElementById('ch-target');
const chTEmoji  =document.getElementById('ch-t-emoji');
const chTName   =document.getElementById('ch-t-name');
const chDEmoji  =document.getElementById('ch-d-emoji');
const chDName   =document.getElementById('ch-d-name');
const chTimerBar=document.getElementById('ch-timer-bar');
const chTimerNum=document.getElementById('ch-timer-num');
const chFlash   =document.getElementById('ch-flash');
const chSeqEl   =document.getElementById('ch-seq');
const chHistEl  =document.getElementById('ch-hist');
const chScoreEl =document.getElementById('ch-score');
const chComboEl =document.getElementById('ch-combo');
const chStreakEl=document.getElementById('ch-streak');
const chLvlBadge=document.getElementById('ch-lvl-badge');
const chReqEl   =document.getElementById('ch-req');
const chStarsEl =document.getElementById('ch-stars');
const chStartBtn=document.getElementById('ch-start');
const pwRight   =document.getElementById('pw-right');
const pwLeft    =document.getElementById('pw-left');
const pwRecInd  =document.getElementById('pw-rec-ind');
const pwBarWrap =document.getElementById('pw-bar-wrap');
const pwBarFill =document.getElementById('pw-bar-fill');
const pwBarLbl  =document.getElementById('pw-bar-lbl');
const pwCd      =document.getElementById('pw-cd');
const pwCdN     =document.getElementById('pw-cd-n');
const pwCdS     =document.getElementById('pw-cd-s');
const pwPlayOv  =document.getElementById('pw-play-ov');
const pwPe      =document.getElementById('pw-pe');
const pwPn      =document.getElementById('pw-pn');
const pwProg    =document.getElementById('pw-prog');
const pwBadge   =document.getElementById('pw-badge');
const pwNameInp =document.getElementById('pw-name');
const pwPreview =document.getElementById('pw-preview');
const pwBtnStart=document.getElementById('pw-btn-start');
const pwBtnStop =document.getElementById('pw-btn-stop');
const pwBtnClear=document.getElementById('pw-btn-clear');
const pwBtnSave =document.getElementById('pw-btn-save');
const pwBtnPlay =document.getElementById('pw-btn-play');
const pwSavedList=document.getElementById('pw-saved-list');
const pwSavedCnt=document.getElementById('pw-saved-count');
const pwResult  =document.getElementById('pw-result');
const pwOkEl    =document.getElementById('pw-ok');
const pwErrEl   =document.getElementById('pw-err');
const pwAccEl   =document.getElementById('pw-acc');
const pwStepsEl =document.getElementById('pw-steps');
const pwRecSec  =document.getElementById('pw-rec-sec');
const pwPlaySec =document.getElementById('pw-play-sec');
const drawModeLbl   =document.getElementById('draw-mode-lbl');
const drawColorDot  =document.getElementById('draw-color-dot');
const drawLinesCount=document.getElementById('draw-lines-count');
const drawCurColorBox=document.getElementById('draw-cur-color-box');

const RING_C=2*Math.PI*44;
let activeTab='live', fpsF=0, lastFpsT=performance.now();
let liveLastId=null, liveLogN=0;

/* ══════════════════════════════════════════
   LIVE TAB
══════════════════════════════════════════ */
document.querySelectorAll('.gc').forEach(c=>c.style.setProperty('--card-color',c.dataset.color||'#c084fc'));

function setRing(r,col){
  ringP.style.strokeDashoffset=RING_C*(1-r);
  ringP.style.stroke=col;
}
function updateLive(g){
  if(!g){
    if(liveLastId!==null){
      gbadge.className=''; gbEmoji.textContent='✋';
      gbLabel.textContent='في انتظار'; gbName.textContent='الإيماءة';
      gbName.style.color='var(--mu)'; setRing(0,'#334155');
      document.querySelectorAll('.gc').forEach(c=>c.classList.remove('active'));
      gStateEl.textContent='--'; liveLastId=null;
    }
    return;
  }
  if(g.id!==liveLastId){
    const col=G_COL[g.id]||'#c084fc';
    gbEmoji.textContent=g.emoji; gbLabel.textContent='تم التعرف على';
    gbName.textContent=g.label; gbName.style.color=col;
    gbadge.className=g.id; gStateEl.textContent=g.label; setRing(1,col);
    gbadge.classList.remove('pop'); void gbadge.offsetWidth; gbadge.classList.add('pop');
    document.querySelectorAll('.gc').forEach(c=>c.classList.toggle('active',c.dataset.id===g.id));
    liveLogN++; logBadge.textContent=liveLogN;
    const t=new Date().toLocaleTimeString('en',{hour12:false});
    const el=document.createElement('div'); el.className='le';
    el.innerHTML=`<span>${g.emoji}</span><span>${g.label}</span><span>${t}</span>`;
    logEl.prepend(el);
    if(logEl.children.length>25) logEl.removeChild(logEl.lastChild);
    liveLastId=g.id;
  }
}

/* ══════════════════════════════════════════
   CHALLENGE TAB
══════════════════════════════════════════ */
let chRun=false,chLvl=1,chScore=0,chStreak=0,chCombo=1;
let chSeq=[],chCur=0,chTime=10,chTimer=null,chHoldId=null,chHoldF=0;
const CH_HOLD=10;
// استخدم فقط الإيماءات الأساسية في التحدي
const CH_GESTURES=GESTURES.filter(g=>['open_hand','four_fingers','three_fingers','peace','gun','thumb_up'].includes(g.id));

function chBuild(n){
  const r=[]; let last=null;
  for(let i=0;i<n;i++){
    let p; do{p=CH_GESTURES[Math.floor(Math.random()*CH_GESTURES.length)];}while(p===last);
    r.push(p); last=p;
  }
  return r;
}
function chRender(){
  chSeqEl.innerHTML='';
  chSeq.forEach((g,i)=>{
    const d=document.createElement('div');
    d.className='si '+(i<chCur?'done':i===chCur?'cur':'pend');
    d.textContent=g.emoji; chSeqEl.appendChild(d);
  });
}
function chShowTgt(){ const g=chSeq[chCur]; if(!g) return; chTEmoji.textContent=g.emoji; chTName.textContent=g.label; chTarget.classList.remove('ok'); }
function chMatch(){
  chTarget.classList.add('ok');
  chFlash.classList.add('on'); setTimeout(()=>chFlash.classList.remove('on'),170);
  const pts=(100+Math.floor(chTime*10))*chCombo;
  chScore+=pts; chStreak++; chCombo=Math.min(1+Math.floor(chStreak/2),5);
  chScoreEl.textContent=chScore; chComboEl.textContent='x'+chCombo; chStreakEl.textContent=chStreak;
  const rect=chTarget.getBoundingClientRect();
  const pop=document.createElement('div'); pop.className='spop';
  pop.textContent='+'+pts; pop.style.cssText=`left:${rect.left+rect.width/2-20}px;top:${rect.top}px`;
  document.body.appendChild(pop); setTimeout(()=>pop.remove(),1200);
  const items=chSeqEl.querySelectorAll('.si'); if(items[chCur]) items[chCur].className='si done';
  chCur++;
  if(chCur>=chSeq.length){ clearInterval(chTimer); setTimeout(chLvlDone,420); }
  else{ chTime=10; chTimerUpd(); chShowTgt(); chRender(); }
}
function chTick(){
  if(!chRun) return;
  chTime=Math.max(0,chTime-1); chTimerUpd();
  if(chTime===0){
    chStreak=0; chCombo=1; chComboEl.textContent='x1'; chStreakEl.textContent='0';
    const items=chSeqEl.querySelectorAll('.si');
    if(items[chCur]){ items[chCur].className='si fail'; setTimeout(()=>{ const e=chSeqEl.querySelectorAll('.si')[chCur]; if(e) e.className='si cur'; },500); }
    chTime=10; chTimerUpd(); chHoldId=null; chHoldF=0;
  }
}
function chTimerUpd(){ chTimerBar.style.width=(chTime/10*100)+'%'; chTimerNum.textContent=chTime; chTimerBar.classList.toggle('red',chTime<=3); }
function chEarnStars(n){ chStarsEl.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<n)); }
function chLvlDone(){
  chRun=false; clearInterval(chTimer);
  chEarnStars(Math.min(5,Math.max(1,Math.ceil(chStreak/1.5))));
  const row=document.createElement('div'); row.className='chr';
  row.innerHTML=`<span class="chl">L${chLvl}</span><span style="flex:1">مكتمل ✓</span><span class="chs">${chScore}</span>`;
  chHistEl.prepend(row);
  chLvl++; chLvlBadge.textContent=chLvl; chReqEl.textContent=Math.min(chLvl+1,6);
  chStartBtn.textContent='▶ المستوى '+chLvl; chStartBtn.disabled=false;
}
function showCd(cb){
  const ov=document.createElement('div'); ov.className='cd-ov';
  const nd=document.createElement('div'); nd.className='cdn';
  const sd=document.createElement('div'); sd.className='cds';
  ov.appendChild(nd); ov.appendChild(sd);
  document.getElementById('cam-box').appendChild(ov);
  let n=3;
  (function t(){ nd.textContent=n===0?'GO!':n; sd.textContent=n===0?'':'استعد...';
    nd.style.animation='none'; void nd.offsetWidth; nd.style.animation='cpop .62s cubic-bezier(.34,1.56,.64,1) forwards';
    n--; if(n<0) setTimeout(()=>{ov.remove();cb();},620); else setTimeout(t,880); })();
}
chStartBtn.addEventListener('click',()=>{
  chSeq=chBuild(Math.min(chLvl+1,6)); chCur=0; chHoldId=null; chHoldF=0;
  chReqEl.textContent=chSeq.length; chLvlBadge.textContent=chLvl;
  chStartBtn.disabled=true; chStartBtn.textContent='⏳ جاري...';
  chEarnStars(0); chRender(); chShowTgt(); chTime=10; chTimerUpd();
  showCd(()=>{ chRun=true; clearInterval(chTimer); chTimer=setInterval(chTick,1000); });
});
document.getElementById('ch-reset').addEventListener('click',()=>{
  clearInterval(chTimer); chRun=false; chLvl=1; chScore=0; chStreak=0; chCombo=1;
  chSeq=[]; chCur=0; chHoldId=null; chHoldF=0;
  chScoreEl.textContent='0'; chComboEl.textContent='x1'; chStreakEl.textContent='0';
  chLvlBadge.textContent='1'; chReqEl.textContent='2';
  chStartBtn.textContent='▶ ابدأ التحدي'; chStartBtn.disabled=false;
  chTimerBar.style.width='100%'; chTimerNum.textContent='10'; chTimerBar.classList.remove('red');
  chTEmoji.textContent='🎯'; chTName.textContent='اضغط ابدأ';
  chSeqEl.innerHTML=''; chHistEl.innerHTML=''; chEarnStars(0);
});

/* ══════════════════════════════════════════
   POWERS TAB
══════════════════════════════════════════ */
const MAX_REC=20, PW_HOLD=12;
let pwState='idle', pwRecorded=[], pwSaved=[], pwSelIdx=-1;
let pwPlayIdx=0, pwPlayResults=[], pwHoldId=null, pwHoldF=0;

function pwUpdateBar(){ pwBarFill.style.width=(pwRecorded.length/MAX_REC*100)+'%'; pwBarLbl.textContent=pwBadge.textContent=pwRecorded.length+'/20'; }
function pwStopRec(){
  if(pwState!=='recording') return;
  pwState='idle'; pwRecInd.classList.add('hidden'); pwBarWrap.classList.add('hidden');
  pwBtnStart.disabled=false; pwBtnStop.disabled=true; pwBtnSave.disabled=pwRecorded.length===0;
}
function pwCapture(g){
  if(pwRecorded.length>=MAX_REC){pwStopRec();return;}
  pwRecorded.push(g);
  const c=document.createElement('div'); c.className='pwc'; c.textContent=g.emoji; c.title=g.label;
  pwPreview.appendChild(c); pwUpdateBar(); if(pwRecorded.length>=MAX_REC) pwStopRec();
}
const pwClear=()=>{ pwRecorded=[]; pwPreview.innerHTML=''; pwBtnSave.disabled=true; pwUpdateBar(); };
function pwSaveSeq(){
  if(!pwRecorded.length) return;
  const name=pwNameInp.value.trim()||('تسلسل '+(pwSaved.length+1));
  pwSaved.push({name,gestures:[...pwRecorded]}); pwNameInp.value=''; pwClear(); pwRenderSaved();
}
function pwRenderSaved(){
  pwSavedList.innerHTML=''; pwSavedCnt.textContent=pwSaved.length;
  pwBtnPlay.disabled=pwSelIdx<0||pwSelIdx>=pwSaved.length;
  pwSaved.forEach((s,i)=>{
    const card=document.createElement('div'); card.className='pwcard'+(i===pwSelIdx?' sel':'');
    card.innerHTML=`<div style="flex:1;min-width:0"><div class="pwcn">${s.name}</div><div class="pwce">${s.gestures.map(g=>g.emoji).join(' ')}</div></div><div class="pwcc">${s.gestures.length} حركة</div><button class="pwdel">🗑</button>`;
    card.addEventListener('click',e=>{ if(e.target.classList.contains('pwdel')) return; pwSelIdx=i; pwRenderSaved(); pwResult.classList.add('hidden'); });
    card.querySelector('.pwdel').addEventListener('click',()=>{ pwSaved.splice(i,1); if(pwSelIdx>=pwSaved.length) pwSelIdx=pwSaved.length-1; pwRenderSaved(); });
    pwSavedList.appendChild(card);
  });
}
function pwShowStep(){
  const seq=pwSaved[pwSelIdx]; if(!seq||pwPlayIdx>=seq.gestures.length){pwFinish();return;}
  const g=seq.gestures[pwPlayIdx]; pwPe.textContent=g.emoji; pwPn.textContent=g.label; pwProg.style.width='0%'; pwPlayOv.classList.remove('hidden');
}
function pwFinish(){
  pwState='idle'; pwPlayOv.classList.add('hidden');
  const ok=pwPlayResults.filter(Boolean).length, total=pwPlayResults.length;
  pwOkEl.textContent=ok; pwErrEl.textContent=total-ok; pwAccEl.textContent=(total?Math.round(ok/total*100):0)+'%';
  const seq=pwSaved[pwSelIdx]; pwStepsEl.innerHTML='';
  pwPlayResults.forEach((good,i)=>{ const chip=document.createElement('div'); chip.className='pstep '+(good?'ok':'err'); chip.textContent=(seq.gestures[i]?.emoji||'?')+(good?' ✓':' ✗'); pwStepsEl.appendChild(chip); });
  pwResult.classList.remove('hidden');
}
pwBtnStart.addEventListener('click',()=>{
  if(pwState!=='idle') return; pwState='countdown'; pwBtnStart.disabled=true;
  pwCd.classList.remove('hidden'); let n=3;
  (function t(){ pwCdN.textContent=n; pwCdS.textContent=n>0?'استعد...':'سجّل!';
    pwCdN.style.animation='none'; void pwCdN.offsetWidth; pwCdN.style.animation='cpop .6s cubic-bezier(.34,1.56,.64,1) forwards';
    n--; if(n<0){ pwCd.classList.add('hidden'); pwState='recording'; pwHoldId=null; pwHoldF=0; pwRecInd.classList.remove('hidden'); pwBarWrap.classList.remove('hidden'); pwBtnStop.disabled=false; pwUpdateBar(); } else setTimeout(t,900); })();
});
pwBtnStop.addEventListener('click',pwStopRec);
pwBtnClear.addEventListener('click',pwClear);
pwBtnSave.addEventListener('click',pwSaveSeq);
pwBtnPlay.addEventListener('click',()=>{
  if(pwSelIdx<0||pwSelIdx>=pwSaved.length||pwState!=='idle') return;
  pwPlayIdx=0; pwHoldId=null; pwHoldF=0; pwPlayResults=[]; pwState='playing'; pwResult.classList.add('hidden'); pwShowStep();
});
document.querySelectorAll('.ptab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const m=btn.dataset.m;
    document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b===btn));
    pwRecSec.classList.toggle('hidden',m!=='rec');
    pwPlaySec.classList.toggle('hidden',m!=='play');
    if(m==='play') pwRenderSaved();
  });
});

/* ══════════════════════════════════════════
   DRAW TAB — قسم الرسم بالإيماءة
   ─────────────────────────────────────────
   ☝️  سبابة فقط         → رسم مستمر
   👍  إبهام فقط         → دوران على لون جديد
   🖐️  السلام (5 أصابع)  → ممحاة: طرف السبابة يمحو
   أي وضع آخر           → إيقاف مؤقت
══════════════════════════════════════════ */
const DRAW_COLORS=['#c084fc','#f472b6','#38bdf8','#4ade80','#fb923c','#fbbf24','#f87171','#ffffff'];
let drawColorIdx=0;
let drawStrokes=[];   // الخطوط المكتملة
let drawCurrent=null; // الخط الجاري رسمه
let thumbCooldown=0;  // كولداون تغيير اللون

// بناء لوحة الألوان في البانل
function buildPalette(){
  const pal=document.getElementById('draw-palette');
  pal.innerHTML='';
  DRAW_COLORS.forEach((col,i)=>{
    const sw=document.createElement('div');
    sw.className='draw-swatch'+(i===drawColorIdx?' active':'');
    sw.style.background=col;
    sw.addEventListener('click',()=>{ drawColorIdx=i; refreshDrawUI(); buildPalette(); });
    pal.appendChild(sw);
  });
}
buildPalette();

function refreshDrawUI(){
  const col=DRAW_COLORS[drawColorIdx];
  drawColorDot.style.background=col;
  drawColorDot.style.boxShadow=`0 0 10px ${col}`;
  drawCurColorBox.style.background=col;
  document.querySelectorAll('.draw-swatch').forEach((s,i)=>s.classList.toggle('active',i===drawColorIdx));
}
refreshDrawUI();

document.getElementById('draw-clear-all').addEventListener('click',()=>{
  drawStrokes=[]; drawCurrent=null;
  const W=dcv.clientWidth, H=dcv.clientHeight;
  if(dcv.width!==W||dcv.height!==H){dcv.width=W;dcv.height=H;}
  dcv.getContext('2d').clearRect(0,0,dcv.width,dcv.height);
  drawLinesCount.textContent='0';
});

/* ── رسم كل الخطوط المحفوظة ─────────────────────────── */
function renderStrokes(){
  const W=dcv.clientWidth, H=dcv.clientHeight;
  if(dcv.width!==W||dcv.height!==H){dcv.width=W;dcv.height=H;}
  const dc=dcv.getContext('2d');
  dc.clearRect(0,0,W,H);
  const all=drawCurrent?[...drawStrokes,drawCurrent]:drawStrokes;
  for(const s of all){
    if(s.points.length<2) continue;
    dc.beginPath();
    dc.strokeStyle=s.color; dc.lineWidth=s.width;
    dc.lineCap='round'; dc.lineJoin='round';
    // رسم ناعم بمتوسط النقاط
    dc.moveTo(s.points[0].x,s.points[0].y);
    for(let i=1;i<s.points.length-1;i++){
      const mx=(s.points[i].x+s.points[i+1].x)/2;
      const my=(s.points[i].y+s.points[i+1].y)/2;
      dc.quadraticCurveTo(s.points[i].x,s.points[i].y,mx,my);
    }
    const last=s.points[s.points.length-1];
    dc.lineTo(last.x,last.y);
    dc.stroke();
  }
  // رسم مؤشر الممحاة إذا في وضع المسح
  if(erasePos){
    dc.beginPath();
    dc.arc(erasePos.x,erasePos.y,ERASE_R,0,Math.PI*2);
    dc.strokeStyle='rgba(239,68,68,0.8)'; dc.lineWidth=2;
    dc.stroke();
    dc.fillStyle='rgba(239,68,68,0.1)'; dc.fill();
  }
}

/* ── كشف تقاطع نقطة مع خط ──────────────────────────── */
const ERASE_R=32; // نصف قطر الممحاة بالبكسل
let erasePos=null; // موضع مؤشر الممحاة الحالي

function hitTestStroke(stroke, px, py){
  for(let i=0;i<stroke.points.length-1;i++){
    const ax=stroke.points[i].x,   ay=stroke.points[i].y;
    const bx=stroke.points[i+1].x, by=stroke.points[i+1].y;
    const dx=bx-ax, dy=by-ay;
    const len2=dx*dx+dy*dy;
    let t=len2>0?((px-ax)*dx+(py-ay)*dy)/len2:0;
    t=Math.max(0,Math.min(1,t));
    const ex=ax+t*dx-px, ey=ay+t*dy-py;
    if(ex*ex+ey*ey<ERASE_R*ERASE_R) return true;
  }
  return false;
}

function eraseAt(px,py){
  const before=drawStrokes.length;
  drawStrokes=drawStrokes.filter(s=>!hitTestStroke(s,px,py));
  if(drawStrokes.length!==before) drawLinesCount.textContent=drawStrokes.length;
}

/* ── منطق تحديث الرسم لكل فريم ──────────────────────── */
function updateDraw(hands){
  const W=dcv.clientWidth, H=dcv.clientHeight;
  if(dcv.width!==W||dcv.height!==H){dcv.width=W;dcv.height=H;}

  if(!hands.length){
    // لا يد → أنهِ الخط الحالي
    if(drawCurrent){ drawStrokes.push(drawCurrent); drawCurrent=null; drawLinesCount.textContent=drawStrokes.length; }
    erasePos=null;
    drawModeLbl.textContent='في انتظار ✋';
    renderStrokes();
    return;
  }

  const lm=hands[0];
  const f=getF(lm);

  // إحداثيات طرف السبابة (معكوسة — كاميرا المرآة)
  const ix=(1-lm[8].x)*W,  iy=lm[8].y*H;
  // نقطة وسط راحة اليد (للممحاة)
  const mx=(1-lm[9].x)*W,  my=lm[9].y*H;

  /* ── تغيير اللون: إبهام فقط ─── */
  if(thumbCooldown>0) thumbCooldown--;
  if(f.th&&!f.i&&!f.m&&!f.r&&!f.k && thumbCooldown===0){
    // أنهِ الخط الحالي عند تغيير اللون
    if(drawCurrent){ drawStrokes.push(drawCurrent); drawCurrent=null; drawLinesCount.textContent=drawStrokes.length; }
    drawColorIdx=(drawColorIdx+1)%DRAW_COLORS.length;
    refreshDrawUI(); buildPalette();
    thumbCooldown=40; // ~1.3 ثانية على 30fps
    erasePos=null;
    drawModeLbl.textContent='تغيير اللون 👍 → '+DRAW_COLORS[drawColorIdx];
    renderStrokes();
    return;
  }

  /* ── الممحاة: السلام (5 أصابع) ─── */
  if(f.th&&f.i&&f.m&&f.r&&f.k){
    // أنهِ أي رسم جارٍ
    if(drawCurrent){ drawStrokes.push(drawCurrent); drawCurrent=null; drawLinesCount.textContent=drawStrokes.length; }
    // الممحاة تعمل على طرف السبابة للدقة
    erasePos={x:ix, y:iy};
    eraseAt(ix, iy);
    drawModeLbl.textContent='ممحاة 🖐️';
    renderStrokes();
    return;
  }

  /* ── الرسم: سبابة فقط ─── */
  if(!f.th&&f.i&&!f.m&&!f.r&&!f.k){
    erasePos=null;
    drawModeLbl.textContent='رسم ✏️';
    const col=DRAW_COLORS[drawColorIdx];
    if(!drawCurrent){
      drawCurrent={color:col, width:4.5, points:[]};
    }
    drawCurrent.points.push({x:ix, y:iy});
    renderStrokes();
    return;
  }

  /* ── أي وضع آخر → توقف ─── */
  erasePos=null;
  if(drawCurrent){
    if(drawCurrent.points.length>1){ drawStrokes.push(drawCurrent); drawLinesCount.textContent=drawStrokes.length; }
    drawCurrent=null;
    renderStrokes();
  }
  // عرض الحالة الحالية
  if(f.th) drawModeLbl.textContent='👍 ارفع إبهامك لتغيير اللون';
  else drawModeLbl.textContent='في انتظار ✋';
}

/* ══════════════════════════════════════════
   تبديل التابات
══════════════════════════════════════════ */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeTab=btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+activeTab));
    document.querySelectorAll('.tab-ov').forEach(o=>o.classList.toggle('active',o.id==='ov-'+activeTab));
    clearCB(); clearEM(); liveLastId=null;
    if(activeTab!=='powers'){
      if(pwState==='recording') pwStopRec();
      if(pwState==='playing'){ pwState='idle'; pwPlayOv.classList.add('hidden'); }
    }
    if(activeTab!=='draw'&&drawCurrent){ drawStrokes.push(drawCurrent); drawCurrent=null; drawLinesCount.textContent=drawStrokes.length; renderStrokes(); }
  });
});

/* ══════════════════════════════════════════
   onResults — معالجة نتائج MediaPipe
══════════════════════════════════════════ */
function onResults(results){
  fpsF++; const now=performance.now();
  if(now-lastFpsT>=1000){ document.getElementById('fps-el').textContent=fpsF+' FPS'; fpsF=0; lastFpsT=now; }

  const rawHands=results.multiHandLandmarks||[];
  const handness=results.multiHandedness   ||[];

  // اختر alpha حسب التاب — الرسم يحتاج تنعيماً أكثر
  const alpha=(activeTab==='draw')?EMA_DRAW:EMA_LIVE;
  const hands=rawHands.map((lm,i)=>smooth(i,lm,alpha));

  drawSkeleton(vid,cv,hands);
  handCountEl.textContent=hands.length;

  /* ── LIVE ── */
  if(activeTab==='live'){
    if(!hands.length) updateLive(null);
    else updateLive(stabilize('live',recognize(hands[0])));
    return;
  }

  /* ── CHALLENGE ── */
  if(activeTab==='challenge'){
    if(!hands.length){ chDEmoji.textContent='✋'; chDName.textContent='--'; chHoldId=null; chHoldF=0; return; }
    const r0=recognize(hands[0]);
    chDEmoji.textContent=r0?r0.emoji:'✋'; chDName.textContent=r0?r0.label:'--';
    if(chRun&&chSeq[chCur]){
      const tgt=chSeq[chCur];
      if(r0&&r0.id===tgt.id){ if(chHoldId===r0.id) chHoldF++; else{chHoldId=r0.id;chHoldF=1;} if(chHoldF>=CH_HOLD){chHoldId=null;chHoldF=0;chMatch();} }
      else{chHoldId=null;chHoldF=0;chTarget.classList.remove('ok');}
    }
    return;
  }

  /* ── POWERS ── */
  if(activeTab==='powers'){
    [pwRight,pwLeft].forEach(el=>{el.textContent='--';el.classList.remove('on');});
    handness.forEach((h,i)=>{
      if(!hands[i]) return;
      const el=h.label==='Right'?pwRight:pwLeft;
      const g=stabilize('pw_h'+i,recognize(hands[i]));
      el.textContent=g?g.emoji+' '+g.label:'🤚 مكتشف'; el.classList.add('on');
    });
    if(pwState==='recording'&&hands.length>0){
      const g=stabilize('pw0',recognize(hands[0]));
      if(g){ if(pwHoldId===g.id) pwHoldF++; else{pwHoldId=g.id;pwHoldF=1;} if(pwHoldF>=PW_HOLD){pwHoldF=0;if(!pwRecorded.length||pwRecorded[pwRecorded.length-1].id!==g.id) pwCapture(g);} }
      else{pwHoldId=null;pwHoldF=0;}
    }
    if(pwState==='playing'){
      const seq=pwSaved[pwSelIdx]; if(!seq||pwPlayIdx>=seq.gestures.length){pwFinish();return;}
      const tgt=seq.gestures[pwPlayIdx];
      const g=hands.length?stabilize('pw0',recognize(hands[0])):null;
      if(g){ if(pwHoldId===g.id) pwHoldF++; else{pwHoldId=g.id;pwHoldF=1;} pwProg.style.width=Math.min(100,pwHoldF/PW_HOLD*100)+'%';
        if(pwHoldF>=PW_HOLD){ pwHoldId=null;pwHoldF=0; const ok=g.id===tgt.id; pwPlayResults.push(ok); pwPlayOv.style.background=ok?'rgba(74,222,128,.16)':'rgba(239,68,68,.16)'; setTimeout(()=>pwPlayOv.style.background='',320); pwPlayIdx++; if(pwPlayIdx>=seq.gestures.length) setTimeout(pwFinish,420); else pwShowStep(); } }
      else{pwHoldF=0;pwProg.style.width='0%';}
    }
    return;
  }

  /* ── DRAW ── */
  if(activeTab==='draw') updateDraw(hands);
}

/* ══════════════════════════════════════════
   تشغيل MediaPipe Hands
══════════════════════════════════════════ */
const handsModel=new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
handsModel.setOptions({
  maxNumHands:2,
  modelComplexity:1,
  minDetectionConfidence:0.75,
  minTrackingConfidence:0.7,
});
handsModel.onResults(onResults);

const camera=new Camera(vid,{
  onFrame:async()=>{ await handsModel.send({image:vid}); },
  width:1280, height:720,
});
camera.start()
  .then(()=>{ document.getElementById('status-dot').classList.add('on'); document.getElementById('status-text').textContent='النظام يعمل ✓'; })
  .catch(err=>{ document.getElementById('status-text').textContent='خطأ: '+err.message; console.error(err); });

setInterval(()=>{ document.getElementById('clock-el').textContent=new Date().toLocaleTimeString('en',{hour12:false}); },1000);

}); // end DOMContentLoaded
