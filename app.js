'use strict';
const KEY='pregCheckin.v1',BAK=KEY+'.bak',SCHEMA=2;
const SLOTS=[['am','早上','🌅','08:00'],['noon','中午','🌞','12:00'],['pm','晚上','🌇','18:00'],['bed','睡前','🌙','21:30']];
const WD=['日','一','二','三','四','五','六'],WK=[1,2,3,4,5,6,0];
const DISC='剂量与用法以医生意见为准；孕周、预产期仅供参考，以产检为准。';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ds(new Date());
const isD=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const dnum=s=>{const[y,m,d]=s.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};
const nd=n=>{const d=new Date(n*864e5);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const addD=(s,k)=>nd(dnum(s)+k);
const wday=s=>new Date(dnum(s)*864e5).getUTCDay();
const fmtD=s=>{const[,m,d]=s.split('-');return `${+m}月${+d}日 周${WD[wday(s)]}`};
const fmtS=s=>{const[y,m,d]=s.split('-');return `${y}年${+m}月${+d}日`};
const slotName=id=>(SLOTS.find(x=>x[0]===id)||[,id])[1];

/* ---------- storage ---------- */
function blank(){return{schemaVersion:SCHEMA,supps:[],logs:{},weights:[],preg:null,meta:{}}}
function migrate(v){
  const o=blank();o.logs=v.logs||{};o.weights=v.weights||[];o.preg=v.preg||null;o.meta=v.meta||{};
  o.supps=(v.supps||[]).map(s=>{if(s.freqHist){if(!s.pauses)splitOff(s);return s}
    const f=s.freq||{type:'daily'},st=f.start||s.created||today();
    const r={id:s.id,name:s.name,dose:s.dose||'',note:s.note||'',slots:s.slots||['am'],created:s.created||st,
      freqHist:[{from:st,type:f.type,n:f.type==='alt'?2:(+f.n||2),days:f.days||[],start:st}]};
    r.pauses=s.active===false?[{from:today()}]:[];return r});
  return o}
function splitOff(s){const P=[];let open=null;const F=[];
  for(const v of s.freqHist){if(v.type==='off'){if(!open){open={from:v.from};P.push(open)}}else{if(open){open.to=addD(v.from,-1);if(open.to<open.from)P.pop();open=null}F.push(v)}}
  if(!F.length)F.push({from:s.created||today(),type:'daily',start:s.created||today()});s.freqHist=F;s.pauses=P}
function load(){try{const v=JSON.parse(localStorage.getItem(KEY));if(v&&Array.isArray(v.supps))return migrate(v)}catch(e){}return blank()}
let S=load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));return true}catch(e){toast('保存失败，请先导出备份');return false}}

let tt;function toast(t,undo){const e=$('#toast');e.innerHTML=esc(t)+(undo?' <button id="undo">撤销</button>':'');e.hidden=false;e.classList.toggle('top',!$('#modal').hidden);
  clearTimeout(tt);tt=setTimeout(()=>e.hidden=true,undo?5000:2000);if(undo)$('#undo').onclick=()=>{e.hidden=true;undo()}}

/* ---------- frequency ---------- */
function ver(s,date){let v=null;for(const x of s.freqHist)if(x.from<=date)v=x;return v}
function isDue(s,date){
  if(s.deletedAt&&date>s.deletedAt)return false;
  if((s.pauses||[]).some(p=>p.from<=date&&(!p.to||date<=p.to)))return false;
  const v=ver(s,date);if(!v)return false;
  if(date<v.start)return false;
  if(v.type==='daily')return true;
  if(v.type==='weekly')return (v.days||[]).includes(wday(date));
  const n=v.type==='alt'?2:Math.max(2,+v.n||2);
  return (dnum(date)-dnum(v.start))%n===0}
const cur=s=>s.freqHist[s.freqHist.length-1];
const lastRule=s=>cur(s);
const openPause=s=>{const P=s.pauses||[],p=P[P.length-1];return p&&!p.to?p:null};
const paused=s=>!!openPause(s);
function pause(s){(s.pauses=s.pauses||[]).push({from:today()})}
function resume(s){const p=openPause(s);if(!p)return;if(p.from>=today())s.pauses.pop();else p.to=addD(today(),-1)}
function ruleText(v){const st=v.start>today()?`，${fmtS(v.start)}开始`:'';
  if(v.type==='daily')return '每天'+st;if(v.type==='alt')return `隔天（${fmtS(v.start)}起）`;
  if(v.type==='everyN')return `每${v.n}天一次（${fmtS(v.start)}起）`;
  return '每周'+WK.filter(d=>(v.days||[]).includes(d)).map(d=>WD[d]).join('、')+st}
function pushVer(s,v){const t=today();v.from=t;
  if(s.freqHist.length&&cur(s).from>=t){s.freqHist.pop()} // same-day (or future-dated) edit overwrites
  if(!s.freqHist.length)v.from=v.start<t?v.start:t;      // first version of a supplement
  s.freqHist.push(v)}
const sameRule=(a,b)=>a&&b&&a.type===b.type&&a.start===b.start&&(+a.n||0)===(+b.n||0)&&JSON.stringify([...(a.days||[])].sort())===JSON.stringify([...(b.days||[])].sort());

function tasks(date){const r=[];for(const s of S.supps)if(isDue(s,date))for(const sl of SLOTS.map(x=>x[0]).filter(x=>s.slots.includes(x)))r.push({s,sl,k:s.id+'|'+sl});return r}
const isDone=(date,k)=>!!(S.logs[date]&&S.logs[date][k]);
function setDone(date,k,on){const L=S.logs[date]||(S.logs[date]={});if(on)L[k]=L[k]||Date.now();else delete L[k];if(!Object.keys(L).length)delete S.logs[date];save()}
function status(date){const t=tasks(date);if(!t.length)return 'none';const n=t.filter(x=>isDone(date,x.k)).length;return n===t.length?'full':n?'part':'miss'}

/* ---------- pregnancy ---------- */
const lmp=()=>S.preg&&isD(S.preg.lmp)?S.preg.lmp:null;
const edd=()=>lmp()&&addD(lmp(),280);
function ga(date){const l=lmp();if(!l)return null;const d=dnum(date)-dnum(l);return d<0?null:{w:Math.floor(d/7),d:d%7,days:d}}
function pregLine(){const g=ga(today());if(!lmp())return `<button class="card plink" data-act="preg">🤰 设置末次月经日期，查看孕周 ›</button>`;
  if(!g)return '';const left=dnum(edd())-dnum(today());const tri=g.w<14?'孕早期':g.w<28?'孕中期':'孕晚期';
  let tip='';if(g.w>=42)tip='已超过42周，请以医生意见为准';else if(g.w>=40)tip='已到预产期附近，请按医生安排产检';
  return `<button class="card preg" data-act="preg"><b>孕${g.w}周+${g.d}天</b> · ${left>=0?`距预产期${left}天`:`已过预产期${-left}天`} · ${tri}${S.preg.src==='edd'?'<span class="tag">已按产检校正</span>':''}${tip?`<div class="sub">${tip}</div>`:''}</button>`}

/* ---------- reminders ---------- */
const slotTime=id=>(S.meta.slotTimes&&S.meta.slotTimes[id])||SLOTS.find(x=>x[0]===id)[3];
function reminder(){const now=new Date(),hm=pad(now.getHours())+':'+pad(now.getMinutes()),d=today(),t=tasks(d);
  const parts=SLOTS.filter(x=>slotTime(x[0])<=hm).map(([id,nm])=>[nm,t.filter(x=>x.sl===id&&!isDone(d,x.k)).length]).filter(x=>x[1]);
  return parts.length?`<div class="card remind">🌷 ${parts.map(([nm,n])=>`${nm}还有 ${n} 项没吃哦`).join('，')}</div>`:''}
function backupNag(){const L=S.meta.lastExport,t=today();if(S.meta.nagDay===t)return '';
  const has=S.supps.length||S.weights.length;if(!has)return '';
  const since=L?dnum(t)-dnum(L.slice(0,10)):(S.meta.firstUse?dnum(t)-dnum(S.meta.firstUse):0);
  if(L?since<14:since<7)return '';S.meta.nagDay=t;save();
  return `<div class="card nag">💾 ${L?`已经 ${since} 天没有备份了`:'还没有备份过'}，有空去「备份」页导出一份吧 <button class="lnk" data-tab="settings">去备份</button></div>`}
if(!S.meta.firstUse){S.meta.firstUse=today();save()}

/* ---------- views ---------- */
function taskList(date){
  const t=tasks(date);
  if(!t.length)return `<div class="card empty">${S.supps.some(s=>!s.deletedAt)?'今天没有安排，好好休息 🌸':'还没有补剂，去「补剂」页添加吧 💊'}</div>`;
  const n=t.filter(x=>isDone(date,x.k)).length;
  let h=`<div class="card"><div>已完成 <b>${n}</b> / ${t.length} ${n===t.length?'🎉 都吃完啦，真棒！':''}</div><div class="prog"><i style="width:${n/t.length*100}%"></i></div></div>`;
  for(const[id,nm,ic]of SLOTS){const g=t.filter(x=>x.sl===id);if(!g.length)continue;
    h+=`<div class="card slot"><h3>${ic} ${nm}</h3>`+g.map(x=>`<div class="item ${isDone(date,x.k)?'done':''}" data-k="${esc(x.k)}" data-date="${date}" role="button"><div class="chk">✓</div><div><div class="nm">${esc(x.s.name)}</div>${x.s.dose||x.s.note?`<div class="sub">${esc([x.s.dose,x.s.note].filter(Boolean).join(' · '))}</div>`:''}</div></div>`).join('')+'</div>'}
  return h}
const views={
 today(){const d=today();return (navigator.standalone===false?'<div class="card note">📲 添加到主屏幕后使用，数据更安全：点 Safari 底部「分享」→「添加到主屏幕」</div>':'')+`<div class="sub" style="margin:0 2px">${fmtD(d)}</div>`+pregLine()+reminder()+taskList(d)+backupNag()},
 history(){const m=views.m||(views.m=today().slice(0,7));const[y,mo]=m.split('-').map(Number);
  const first=`${y}-${pad(mo)}-01`,days=new Date(y,mo,0).getDate(),off=(wday(first)+6)%7,td=today(),E=edd();
  let h=`<div class="card"><div class="mhead"><button data-act="prevm" aria-label="上个月">‹</button><b>${y}年${mo}月</b><button data-act="nextm" aria-label="下个月">›</button></div><div class="cal">`+WK.map(w=>`<div class="w">${WD[w]}</div>`).join('')+'<div></div>'.repeat(off);
  let full=0,tot=0;
  for(let i=1;i<=days;i++){const d=`${y}-${pad(mo)}-${pad(i)}`;const fut=d>td;const st=fut?'none':status(d);if(!fut&&st!=='none'){tot++;if(st==='full')full++}
   const g=ga(d);h+=`<button class="d ${st} ${d===td?'today':''} ${fut?'fut':''} ${d===E?'edd':''}" data-day="${d}">${i}${d===E?'<small>预产期</small>':g?`<small>${g.w}+${g.d}</small>`:''}</button>`}
  h+=`</div><div class="legend"><span><i style="background:#e0607e"></i>全部完成</span><span><i style="background:#f9c5d2"></i>部分完成</span><span><i style="background:#ece4e7"></i>没有记录</span>${E?'<span>小字=孕周+天</span>':''}</div></div>`;
  return h+`<div class="card">本月全部完成 <b>${full}</b> 天 / 需服用 <b id="needDays">${tot}</b> 天<div class="sub">点日期可查看详情或补打卡</div></div>`},
 weight(){const w=S.weights.slice().sort((a,b)=>a.date<b.date?-1:1);
  let h=`<div class="card"><div class="row"><div><label>日期</label><input type="date" id="wd" value="${today()}" max="${today()}"></div><div><label>体重 (kg)</label><input id="wk" type="number" inputmode="decimal" step="0.1" min="30" max="200" placeholder="如 55.2"></div></div><button class="btn" data-act="addw">记录体重</button></div>`;
  if(!w.length)return h+'<div class="card empty">还没有体重记录 ⚖️</div>';
  const ch=w[w.length-1].kg-w[0].kg;
  h+=`<div class="card"><b>体重曲线</b><div class="sub">最新 ${w[w.length-1].kg} kg · 累计${ch>=0?'+':''}${ch.toFixed(1)} kg</div>${chart(w)}</div>`;
  return h+'<div class="card"><b>记录</b>'+w.slice().reverse().map((x,i)=>{const prev=w[w.length-2-i];const df=prev?x.kg-prev.kg:null;const g=ga(x.date);return `<div class="wl"><div>${fmtD(x.date)}<div class="sub">${g?`孕${g.w}+${g.d} `:''}${df===null?'':(df>=0?'+':'')+df.toFixed(1)+' kg'}</div></div><div><b>${x.kg}</b> kg<button class="x" data-delw="${x.date}" aria-label="删除">✕</button></div></div>`}).join('')+'</div>'},
 supps(){const L=S.supps.filter(s=>!s.deletedAt);let h=`<div class="disc">⚕️ ${DISC}</div><button class="btn" data-act="newsupp">＋ 添加补剂</button>`;
  const Dl=S.supps.filter(s=>s.deletedAt);const del=Dl.length?`<details class="card"><summary>已删除（${Dl.length}）</summary>${Dl.map(s=>`<div class="wl"><div>${esc(s.name)}<div class="sub">${fmtS(s.deletedAt)}删除</div></div><div><button class="lnk" data-act="undel" data-id="${s.id}">恢复</button><button class="lnk" data-act="harddel" data-id="${s.id}">彻底删除</button></div></div>`).join('')}</details>`:'';
  if(!L.length)return h+'<div class="card empty">添加补剂后，每天打开就能看到该吃什么 🌷</div>'+del;
  return h+L.map(s=>`<button class="card sc" data-edit="${s.id}"><div class="nm">${esc(s.name)}${paused(s)?'<span class="tag off">已暂停</span>':''}</div><div class="sub">${[s.dose,ruleText(lastRule(s)),s.slots.map(slotName).join('/')].filter(Boolean).map(esc).join(' · ')}</div>${s.note?`<div class="sub">${esc(s.note)}</div>`:''}</button>`).join('')+del},
 settings(){const L=S.meta.lastExport;const ago=L?dnum(today())-dnum(L.slice(0,10)):null;
  return `<div class="card"><b>🤰 孕周设置</b><div class="sub">${lmp()?`末次月经 ${fmtS(lmp())} · 预产期 ${fmtS(edd())}${S.preg.src==='edd'?'（已按产检校正）':''}`:'还没有设置'}</div><button class="btn ghost" data-act="preg">${lmp()?'修改':'设置'}孕周</button></div>
<div class="card"><b>⏰ 打卡提醒时间</b><div class="sub">打开 App 时，到点还没打卡的时段会在今日页顶部温和提醒（不会推送通知）。</div><div class="times">${SLOTS.map(([id,nm,ic])=>`<label>${ic} ${nm}<input type="time" data-slottime="${id}" value="${slotTime(id)}"></label>`).join('')}</div></div>
<div class="card"><b>💾 数据备份</b><div class="sub">上次备份：${L?(ago===0?'今天':ago+' 天前'):'还没有备份过'}</div><div class="sub" id="persist">持久存储：检查中…</div>
<div class="note">📱 主屏幕图标里的数据与 Safari 浏览器里的数据是分开的；删除主屏幕图标或清理网站数据会清空记录，请定期导出备份，保存到「文件」App。</div>
<button class="btn" data-act="export">导出备份</button><button class="btn ghost" data-act="import">从备份恢复</button>${localStorage.getItem(BAK)?'<button class="btn ghost" data-act="undoimp">撤销上次恢复</button>':''}<input type="file" id="imp" accept=".json,application/json" hidden></div>
<button class="btn ghost" data-act="onb" data-step="0">查看使用引导</button><div class="card sub">补剂 ${S.supps.filter(s=>!s.deletedAt).length} 种 · 打卡 ${Object.keys(S.logs).length} 天 · 体重 ${S.weights.length} 条</div><div class="disc">⚕️ ${DISC}</div>`}
};
const TITLES={today:'今日打卡',history:'历史记录',weight:'体重记录',supps:'我的补剂',settings:'设置与备份'};
let tab='today';
function render(){$('#title').textContent=TITLES[tab];$('#view').innerHTML=views[tab]();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  if(tab==='settings')persistState()}
async function persistState(){const e=$('#persist');if(!e)return;let p=false;try{p=await navigator.storage.persisted()}catch(_){}e.textContent='持久存储：'+(p?'已开启 ✓':'未开启（iOS 可能不支持，请定期备份）')}
function chart(w){const W=340,H=190,p=36;const ks=w.map(x=>x.kg);let lo=Math.min(...ks),hi=Math.max(...ks);if(hi-lo<2){lo-=1;hi+=1}
 const t0=dnum(w[0].date),t1=dnum(w[w.length-1].date);const X=d=>p+(t1===t0?(W-p-14)/2:(dnum(d)-t0)/(t1-t0)*(W-p-14)),Y=k=>10+(hi-k)/(hi-lo)*(H-44);
 const pts=w.map(x=>`${X(x.date).toFixed(1)},${Y(x.kg).toFixed(1)}`).join(' ');
 let g='';for(let i=0;i<=3;i++){const k=lo+(hi-lo)*i/3;g+=`<line x1="${p}" x2="${W-6}" y1="${Y(k)}" y2="${Y(k)}" stroke="#fbe3e9"/><text x="${p-4}" y="${Y(k)+4}" text-anchor="end" font-size="12" fill="#7d6a70">${k.toFixed(1)}</text>`}
 const lb=d=>{const q=ga(d);return q?`孕${q.w}周`:`${+d.slice(5,7)}/${+d.slice(8)}`};
 const lab=(d,a)=>`<text x="${X(d)}" y="${H-8}" text-anchor="${a}" font-size="12" fill="#7d6a70">${lb(d)}</text>`;
 return `<svg id="wchart" viewBox="0 0 ${W} ${H}" width="100%">${g}${w.length>1?`<polyline points="${pts}" fill="none" stroke="#e0607e" stroke-width="2.5" stroke-linejoin="round"/>`:''}${w.map(x=>`<circle cx="${X(x.date)}" cy="${Y(x.kg)}" r="4" fill="#fff" stroke="#e0607e" stroke-width="2"/>`).join('')}${lab(w[0].date,w.length>1?'start':'middle')}${w.length>1?lab(w[w.length-1].date,'end'):''}</svg>`}

/* ---------- modals ---------- */
function openModal(h,foot){$('#toast').hidden=true;$('#sheet').innerHTML=`<div class="sbody">${h}</div><div class="foot">${foot}</div>`;$('#modal').hidden=false}
function closeModal(){$('#modal').hidden=true;$('#toast').classList.remove('top');render()}
function dayModal(d){const fut=d>today(),g=ga(d),E=edd();openModal(`<h2>${fmtD(d)}</h2>${g?`<div class="sub">孕${g.w}周+${g.d}天 · ${d===E?'预产期 🎀':dnum(E)>=dnum(d)?`距预产期${dnum(E)-dnum(d)}天`:''}</div>`:''}<div class="sub">${fut?'未来日期不能打卡':'点一下可补打卡/取消'}</div><div id="dayl" class="${fut?'lock':''}">${taskList(d)}</div>`,'<button class="btn ghost" data-act="close">关闭</button>')}
function pregModal(){const l=lmp()||'',e=edd()||'';openModal(`<h2>孕周设置</h2><div class="disc">⚕️ ${DISC}</div>
<label>末次月经第一天</label><input type="date" id="p_lmp" value="${S.preg&&S.preg.src!=='edd'?l:''}" max="${today()}">
<div class="sub">按末次月经推算：预产期 = 末次月经 + 280 天</div>
<label>或：医生/B超校正后的预产期</label><input type="date" id="p_edd" value="${S.preg&&S.preg.src==='edd'?e:''}">
<div class="sub">填写预产期会以它为准，并标注“已按产检校正”。两项都填时以预产期为准。</div>`,
`<button class="btn" data-act="savepreg">保存</button>${l?'<button class="btn ghost" data-act="clearpreg">清除孕周设置</button>':''}<button class="btn ghost" data-act="close">取消</button>`)}
function savePreg(){const a=$('#p_lmp').value,b=$('#p_edd').value,t=today();let L,src;
  if(b){L=addD(b,-280);src='edd';if(dnum(b)<dnum(t)-14||dnum(b)>dnum(t)+300){if(!confirm('这个预产期离今天比较远，确认填写正确吗？'))return}
    if(L>t)return toast('这个预产期推算的末次月经还没到，请再确认一下')}
  else if(a){if(a>t)return toast('日期还没到，请再确认一下');if(dnum(t)-dnum(a)>300&&!confirm('日期距今较久，请确认是否填写正确'))return;L=a;src='lmp'}
  else return toast('请填写末次月经日期或预产期');
  S.preg={lmp:L,src};save();if(S.meta.onbPreg&&!S.meta.onboarded){S.meta.onbPreg=false;onboard(2);return}closeModal();toast('已保存孕周设置 ✓')}

let ed=null;
const PRESETS=['DHA','钙','铁','维生素D'];
function suppModal(s){const t=today();ed=s?{...JSON.parse(JSON.stringify(s)),_isEdit:true}:{id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:'',dose:'',note:'',slots:['am'],freqHist:[],pauses:[],created:t};
  const r=s?lastRule(s):null;ed.f=r?{type:r.type,n:r.n||3,days:[...(r.days||[])],start:r.start}:{type:'daily',n:3,days:[],start:t};drawSupp()}
function drawSupp(){const f=ed.f;openModal(`<h2>${ed._isEdit?'编辑补剂':'添加补剂'}</h2><div class="disc">⚕️ ${DISC}</div>
${ed._isEdit?'':`<label>快捷添加（只填名称）</label><div class="chips">${PRESETS.map(p=>`<button data-preset="${p}">${p}</button>`).join('')}</div>`}
<label>名称</label><input id="f_name" value="${esc(ed.name)}" placeholder="如 叶酸、DHA、钙">
<label>每次剂量</label><input id="f_dose" value="${esc(ed.dose)}" placeholder="按医嘱填写">
<label>吃的时间（可多选）</label><div class="chips">${SLOTS.map(([id,nm,ic])=>`<button data-slot="${id}" class="${ed.slots.includes(id)?'on':''}">${ic} ${nm}</button>`).join('')}</div>
<label>频次</label><div class="chips">${[['daily','每天'],['alt','隔天'],['everyN','每隔N天'],['weekly','每周固定几天']].map(([v,n])=>`<button data-type="${v}" class="${f.type===v?'on':''}">${n}</button>`).join('')}</div>
${f.type==='everyN'?`<label>每几天吃一次（2–30）</label><input id="f_n" type="number" inputmode="numeric" min="2" max="30" value="${f.n||3}">`:''}
${f.type==='weekly'?`<label>每周哪几天</label><div class="chips">${WK.map(d=>`<button data-wd="${d}" class="${f.days.includes(d)?'on':''}">周${WD[d]}</button>`).join('')}</div>`:''}
<label>${f.type==='alt'||f.type==='everyN'?'从哪天开始吃（这天算第一次）':'从哪天开始'}</label><input id="f_start" type="date" value="${f.start}">
${ed._isEdit?`<div class="sub">修改频次只影响今天及以后，之前的记录不会变。${paused(ed)?'<br>当前已暂停，新频次将在恢复后生效。':''}</div>`:''}
<label>备注</label><input id="f_note" value="${esc(ed.note)}" placeholder="如 饭后吃、和钙隔开">
${ed._isEdit?`<button class="btn ghost" data-act="pause">${paused(ed)?'从今天恢复服用':'从今天暂停服用'}</button><button class="btn danger" data-act="delsupp">删除</button>`:''}`,
`<div class="row"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="savesupp">保存</button></div>`)}
function grab(){for(const k of['name','dose','note']){const e=$('#f_'+k);if(e)ed[k]=e.value.trim()}const n=$('#f_n');if(n)ed.f.n=parseInt(n.value)||0;const st=$('#f_start');if(st&&isD(st.value))ed.f.start=st.value}
function commit(){const o={...ed};delete o._isEdit;delete o.f;const i=S.supps.findIndex(x=>x.id===o.id);if(i>=0)S.supps[i]=o;else S.supps.push(o);save()}

const ONB=[()=>`<h2>欢迎 🌷</h2><p>这里记录每天的补剂打卡、孕周和体重。</p><div class="disc">⚕️ ${DISC}</div><p class="sub">本应用不提供任何剂量或用药建议，补剂名称、剂量、频次请按医生意见填写。</p>`,
 ()=>`<h2>设置孕周（可跳过）</h2><p>填写末次月经第一天，就能看到孕周和预产期；B超校正后可在「设置」页改预产期。</p>`,
 ()=>`<h2>记得备份 💾</h2><div class="note">📱 主屏幕图标里的数据与 Safari 浏览器里的数据是分开的；删除主屏幕图标或清理网站数据会清空记录，请定期在「设置」页导出备份。</div>${navigator.standalone?'':'<p>建议先添加到主屏幕：点 Safari 底部「分享」→「添加到主屏幕」，以后从桌面图标打开。</p>'}`];
function onboard(i){const last=i===ONB.length-1;openModal(`<div class="sub">${i+1} / ${ONB.length}</div>`+ONB[i](),
 (i===1?`<div class="row"><button class="btn ghost" data-act="onb" data-step="2">跳过</button><button class="btn" data-act="onbpreg">去设置</button></div>`:
 `<button class="btn" data-act="${last?'onbdone':'onb'}" data-step="${i+1}">${last?'开始使用':'下一步'}</button>`))}
/* ---------- events ---------- */
document.addEventListener('click',e=>{const t=e.target.closest('button,[data-k]');if(!t||t.id==='undo')return;const D=t.dataset;
 if(D.tab){if(D.tab==='history'&&tab!=='history')views.m=null;tab=D.tab;render();scrollTo(0,0);return}
 if(D.k){if(t.closest('.lock'))return;const on=!isDone(D.date,D.k),date=D.date,k=D.k;setDone(date,k,on);refresh(date);if(navigator.vibrate)navigator.vibrate(10);
   if(on)toast('已记录',()=>{setDone(date,k,false);refresh(date)});else $('#toast').hidden=true;return}
 if(D.day){dayModal(D.day);return}
 if(D.edit){suppModal(S.supps.find(s=>s.id===D.edit));return}
 if(D.preset){grab();ed.name=D.preset;drawSupp();return}
 if(D.slot){grab();ed.slots=ed.slots.includes(D.slot)?ed.slots.filter(x=>x!==D.slot):[...ed.slots,D.slot];drawSupp();return}
 if(D.type){grab();ed.f.type=D.type;drawSupp();return}
 if(D.wd){grab();const d=+D.wd;ed.f.days=ed.f.days.includes(d)?ed.f.days.filter(x=>x!==d):[...ed.f.days,d];drawSupp();return}
 if(D.delw){const old=S.weights.find(x=>x.date===D.delw);S.weights=S.weights.filter(x=>x!==old);save();render();toast('已删除',()=>{S.weights.push(old);save();render()});return}
 const A=D.act;if(!A)return;
 if(A==='close')closeModal();
 else if(A==='prevm'||A==='nextm'){let[y,m]=views.m.split('-').map(Number);m+=A==='nextm'?1:-1;if(m<1){m=12;y--}if(m>12){m=1;y++}views.m=`${y}-${pad(m)}`;render()}
 else if(A==='newsupp')suppModal(null);
 else if(A==='savesupp'){grab();const f=ed.f;if(!ed.name)return toast('请给补剂起个名字');if(!ed.slots.length)return toast('请至少选一个时间');
   if(f.type==='weekly'&&!f.days.length)return toast('请选择每周哪几天');if(f.type==='everyN'&&!(f.n>=2&&f.n<=30))return toast('间隔天数请填 2–30');
   const v={type:f.type,n:f.type==='alt'?2:f.type==='everyN'?f.n:undefined,days:f.type==='weekly'?f.days:undefined,start:f.start};
   if(!ed.freqHist.length||!sameRule(lastRule(ed),v))pushVer(ed,v);
   const dup=S.supps.some(x=>!x.deletedAt&&x.id!==ed.id&&x.name.trim()===ed.name);if(dup&&!confirm('已有同名补剂，确定再添加一个吗？'))return;
   commit();closeModal();toast(paused(ed)?'已保存。当前已暂停，新频次将在恢复后生效':'已保存 ✓')}
 else if(A==='pause'){grab();if(paused(ed))resume(ed);else pause(ed);commit();closeModal();toast(paused(ed)?'已暂停，之前的记录不变':'已恢复，从今天开始计算')}
 else if(A==='delsupp'){if(confirm(`确定删除「${ed.name}」？之前的打卡记录和统计会保留。`)){ed.deletedAt=today();commit();closeModal();toast('已删除，可在补剂页底部恢复')}}
 else if(A==='undel'){const s=S.supps.find(x=>x.id===D.id);delete s.deletedAt;save();render();toast('已恢复')}
 else if(A==='harddel'){const s=S.supps.find(x=>x.id===D.id);if(confirm(`彻底删除「${s.name}」？这款补剂的历史统计会一并清除，无法恢复。`)){S.supps=S.supps.filter(x=>x!==s);for(const d in S.logs){for(const k in S.logs[d])if(k.startsWith(s.id+'|'))delete S.logs[d][k];if(!Object.keys(S.logs[d]).length)delete S.logs[d]}save();render();toast('已彻底删除')}}
 else if(A==='onb')onboard(+D.step);
 else if(A==='onbdone'){S.meta.onboarded=true;save();closeModal()}
 else if(A==='preg')pregModal();
 else if(A==='onbpreg'){S.meta.onbPreg=true;pregModal()}
 else if(A==='savepreg')savePreg();
 else if(A==='clearpreg'){if(confirm('清除孕周设置？')){S.preg=null;save();closeModal()}}
 else if(A==='addw'){const d=$('#wd').value,k=parseFloat($('#wk').value);if(!isD(d)||d>today())return toast('请选择今天或之前的日期');if(!(k>=30&&k<=200))return toast('请输入 30–200 之间的体重');
   const ex=S.weights.some(x=>x.date===d);S.weights=S.weights.filter(x=>x.date!==d);S.weights.push({date:d,kg:Math.round(k*10)/10});save();render();toast(ex?'已更新这天的记录':'已记录 ✓')}
 else if(A==='export')doExport();
 else if(A==='import')$('#imp').click();
 else if(A==='undoimp'){const b=localStorage.getItem(BAK);if(b&&confirm('撤销上次恢复，回到恢复之前的数据？')){S=migrate(JSON.parse(b));save();localStorage.removeItem(BAK);render();toast('已撤销恢复')}}
});
function refresh(date){if(!$('#modal').hidden){$('#dayl').innerHTML=taskList(date)}else render()}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('change',e=>{
 if(e.target.dataset.slottime){S.meta.slotTimes={...(S.meta.slotTimes||{}),[e.target.dataset.slottime]:e.target.value};save();toast('提醒时间已更新');return}
 if(e.target.id!=='imp')return;const f=e.target.files[0];if(!f)return;
 f.text().then(t=>{let v;try{v=JSON.parse(t)}catch(_){throw '不是有效的备份文件'}const err=validate(v);if(err)throw err;
   const m=migrate(v);const msg=`将用备份覆盖当前数据：\n补剂 ${m.supps.filter(s=>!s.deletedAt).length} 种\n打卡 ${Object.keys(m.logs).length} 天\n体重 ${m.weights.length} 条\n孕周设置：${m.preg&&m.preg.lmp?'有（末次月经 '+m.preg.lmp+'）':'无'}\n\n恢复后可在本页“撤销上次恢复”。确定吗？`;
   if(!confirm(msg))return;localStorage.setItem(BAK,JSON.stringify(S));S=m;save();render();toast('恢复成功 ✓')})
 .catch(x=>toast(typeof x==='string'?x+'，原数据没有变化':'读取失败，原数据没有变化')).finally(()=>e.target.value='')});
function validate(v){if(!v||typeof v!=='object'||Array.isArray(v))return '不是有效的备份文件';
 if(v.schemaVersion!=null&&!(Number.isInteger(v.schemaVersion)&&v.schemaVersion>=1&&v.schemaVersion<=SCHEMA))return '备份版本不支持';
 if(!Array.isArray(v.supps))return '备份里没有补剂数据';
 for(const s of v.supps){if(!s||typeof s.id!=='string'||typeof s.name!=='string'||!Array.isArray(s.slots))return '补剂数据格式不对';
   if(s.freqHist){if(!Array.isArray(s.freqHist)||!s.freqHist.every(x=>x&&isD(x.from)&&typeof x.type==='string'&&(x.type==='off'||isD(x.start))))return '补剂频次数据格式不对'}
   else if(!s.freq||typeof s.freq.type!=='string')return '补剂频次数据格式不对'}
 if(v.logs!=null&&(typeof v.logs!=='object'||Array.isArray(v.logs)||!Object.entries(v.logs).every(([d,o])=>isD(d)&&o&&typeof o==='object')))return '打卡数据格式不对';
 if(v.weights!=null&&(!Array.isArray(v.weights)||!v.weights.every(w=>w&&isD(w.date)&&typeof w.kg==='number')))return '体重数据格式不对';
 if(v.preg!=null&&(typeof v.preg!=='object'||!isD(v.preg.lmp)))return '孕周设置格式不对';
 return null}
async function doExport(){const data=JSON.stringify({app:'pregCheckin',exportedAt:new Date().toISOString(),...S,schemaVersion:SCHEMA},null,1);const name=`孕期打卡备份-${today()}.json`;
 const file=new File([data],name,{type:'application/json'});const done=()=>{S.meta.lastExport=today();save();render()};
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});done();return}catch(e){if(e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.remove();done();toast('已导出')}

/* ---------- day rollover ---------- */
let lastDay=today();
function checkDay(){if(today()!==lastDay){lastDay=today();views.m=null;render()}}
function armMidnight(){const n=new Date(),next=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1,0,0,2);setTimeout(()=>{checkDay();armMidnight()},next-n)}
armMidnight();setInterval(()=>{checkDay();if(tab==='today'&&$('#modal').hidden&&!document.hidden){const r=$('.remind');const nr=reminder();if((r?r.outerHTML:'')!==nr)render()}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkDay();if(tab==='today')render()}});
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}catch(_){}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
if(!S.meta.onboarded&&!S.supps.length&&!S.weights.length)onboard(0);
