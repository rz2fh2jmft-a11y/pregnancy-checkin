'use strict';
const KEY='pregCheckin.v1';
const SLOTS=[['am','早上','🌅'],['noon','中午','🌞'],['pm','晚上','🌇'],['bed','睡前','🌙']];
const WD=['日','一','二','三','四','五','六'];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ds(new Date());
const dnum=s=>{const[y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)/864e5};
const wday=s=>new Date(dnum(s)*864e5).getUTCDay();
const fmtD=s=>{const[,m,d]=s.split('-');return `${+m}月${+d}日 周${WD[wday(s)]}`};
let S=load();
function load(){try{const v=JSON.parse(localStorage.getItem(KEY));if(v&&v.supps)return norm(v)}catch(e){}return{supps:[],logs:{},weights:[]}}
function norm(v){return{supps:v.supps||[],logs:v.logs||{},weights:v.weights||[]}}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,1800)}

function startOf(s){return s.freq.start||s.created||today()}
function isDue(s,date){
  if(!s.active)return false;
  if(dnum(date)<dnum(startOf(s)))return false;
  const f=s.freq;
  if(f.type==='daily')return true;
  if(f.type==='weekly')return (f.days||[]).includes(wday(date));
  const n=f.type==='alt'?2:Math.max(1,+f.n||1);
  return (dnum(date)-dnum(startOf(s)))%n===0;
}
function freqText(s){const f=s.freq;
  if(f.type==='daily')return '每天';
  if(f.type==='alt')return `隔天（${fmtD(startOf(s)).replace(/ .*/,'')}起）`;
  if(f.type==='everyN')return `每隔${f.n}天吃一次（${fmtD(startOf(s)).replace(/ .*/,'')}起）`;
  return '每周'+(f.days||[]).slice().sort().map(d=>WD[d]).join('、');}
function tasks(date){const r=[];for(const s of S.supps)if(isDue(s,date))for(const sl of(s.slots.length?s.slots:['am']))r.push({s,sl,k:s.id+'|'+sl});return r}
function isDone(date,k){return !!(S.logs[date]&&S.logs[date][k])}
function toggle(date,k){const L=S.logs[date]||(S.logs[date]={});if(L[k])delete L[k];else L[k]=Date.now();if(!Object.keys(L).length)delete S.logs[date];save()}
function status(date){const t=tasks(date);if(!t.length)return 'none';const n=t.filter(x=>isDone(date,x.k)).length;return n===t.length?'full':n?'part':'miss'}

function taskList(date){
  const t=tasks(date);
  if(!t.length)return `<div class="card empty">${S.supps.length?'这天没有需要吃的补剂 🌸':'还没有补剂，去「补剂」页添加吧 💊'}</div>`;
  const n=t.filter(x=>isDone(date,x.k)).length;
  let h=`<div class="card"><div>已完成 <b>${n}</b> / ${t.length} ${n===t.length?'🎉 太棒啦！':''}</div><div class="prog"><i style="width:${n/t.length*100}%"></i></div></div>`;
  for(const[id,nm,ic]of SLOTS){const g=t.filter(x=>x.sl===id);if(!g.length)continue;
    h+=`<div class="card slot"><h3>${ic} ${nm}</h3>`+g.map(x=>`<div class="item ${isDone(date,x.k)?'done':''}" data-k="${esc(x.k)}" data-date="${date}"><div class="chk">✓</div><div><div class="nm">${esc(x.s.name)}</div><div class="sub">${esc(x.s.dose)}${x.s.note?' · '+esc(x.s.note):''}</div></div></div>`).join('')+'</div>'}
  return h;
}
const views={
 today(){const d=today();return `<div class="sub" style="margin:0 2px">${fmtD(d)}</div>`+taskList(d)},
 history(){const m=views.m||(views.m=today().slice(0,7));const[y,mo]=m.split('-').map(Number);
  const first=`${y}-${pad(mo)}-01`,days=new Date(y,mo,0).getDate(),off=wday(first),td=today();
  let h=`<div class="card"><div class="mhead"><button data-act="prevm">‹</button><b>${y}年${mo}月</b><button data-act="nextm">›</button></div><div class="cal" style="margin-top:12px">`+WD.map(w=>`<div class="w">${w}</div>`).join('')+'<div></div>'.repeat(off);
  for(let i=1;i<=days;i++){const d=`${y}-${pad(mo)}-${pad(i)}`;const fut=dnum(d)>dnum(td);const st=fut?'none':status(d);
   h+=`<button class="d ${st} ${d===td?'today':''} ${fut?'fut':''}" data-day="${d}">${i}</button>`}
  h+=`</div><div class="legend"><span><i style="background:#e0607e"></i>全部完成</span><span><i style="background:#f9c5d2"></i>部分完成</span><span><i style="background:#f1eaec"></i>未打卡</span></div></div>`;
  let full=0,tot=0;for(let i=1;i<=days;i++){const d=`${y}-${pad(mo)}-${pad(i)}`;if(dnum(d)>dnum(td))break;const st=status(d);if(st!=='none'){tot++;if(st==='full')full++}}
  return h+`<div class="card">本月全部完成 <b>${full}</b> 天 / 需服用 ${tot} 天<div class="sub">点日期可查看详情或补打卡</div></div>`},
 weight(){const w=S.weights.slice().sort((a,b)=>a.date<b.date?-1:1);
  let h=`<div class="card"><div class="row"><div><label>日期</label><input type="date" id="wd" value="${today()}" max="${today()}"></div><div><label>体重 (kg)</label><input id="wk" type="number" inputmode="decimal" step="0.1" placeholder="如 55.2"></div></div><button class="btn" data-act="addw">记录体重</button></div>`;
  if(!w.length)return h+'<div class="card empty">还没有体重记录 ⚖️</div>';
  const ch=w[w.length-1].kg-w[0].kg;
  h+=`<div class="card"><b>体重曲线</b><div class="sub">最新 ${w[w.length-1].kg} kg · 累计${ch>=0?'+':''}${ch.toFixed(1)} kg</div>${chart(w)}</div>`;
  return h+'<div class="card"><b>记录</b>'+w.slice().reverse().map((x,i)=>{const prev=w[w.length-2-i];const df=prev?x.kg-prev.kg:null;return `<div class="wl"><div>${fmtD(x.date)}<div class="sub">${df===null?'':(df>=0?'+':'')+df.toFixed(1)+' kg'}</div></div><div><b>${x.kg}</b> kg<button class="x" data-delw="${x.date}">✕</button></div></div>`}).join('')+'</div>'},
 supps(){let h='<button class="btn" data-act="newsupp">＋ 添加补剂</button>';
  if(!S.supps.length)return h+'<div class="card empty">添加补剂后，每天打开就能看到该吃什么 🌷</div>';
  return h+S.supps.map(s=>`<div class="card" data-edit="${s.id}"><div class="nm">${esc(s.name)}${s.active?'':'<span class="tag off">已暂停</span>'}</div><div class="sub">${esc(s.dose)} · ${freqText(s)} · ${s.slots.map(x=>SLOTS.find(y=>y[0]===x)[1]).join('/')}</div>${s.note?`<div class="sub">${esc(s.note)}</div>`:''}</div>`).join('')},
 settings(){return `<div class="card"><b>数据备份</b><div class="sub">数据只保存在这台手机的浏览器里。建议每隔一段时间导出一次备份文件，保存到「文件」App 或发给自己。</div><button class="btn" data-act="export">导出备份</button><button class="btn ghost" data-act="import">从备份恢复</button><input type="file" id="imp" accept=".json,application/json" hidden></div><div class="card sub">补剂 ${S.supps.length} 种 · 打卡 ${Object.keys(S.logs).length} 天 · 体重 ${S.weights.length} 条</div>`}
};
const TITLES={today:'今日打卡',history:'历史记录',weight:'体重记录',supps:'我的补剂',settings:'备份与设置'};
let tab='today';
function render(){$('#title').textContent=TITLES[tab];$('#view').innerHTML=views[tab]();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab))}
function chart(w){const W=340,H=180,p=34;const ks=w.map(x=>x.kg);let lo=Math.min(...ks),hi=Math.max(...ks);if(hi-lo<2){lo-=1;hi+=1}
 const t0=dnum(w[0].date),t1=dnum(w[w.length-1].date)||t0;const X=d=>p+(t1===t0?(W-p-10)/2:(dnum(d)-t0)/(t1-t0)*(W-p-10)),Y=k=>10+(hi-k)/(hi-lo)*(H-40);
 const pts=w.map(x=>`${X(x.date).toFixed(1)},${Y(x.kg).toFixed(1)}`).join(' ');
 let g='';for(let i=0;i<=3;i++){const k=lo+(hi-lo)*i/3;g+=`<line x1="${p}" x2="${W-6}" y1="${Y(k)}" y2="${Y(k)}" stroke="#fbe3e9"/><text x="${p-4}" y="${Y(k)+4}" text-anchor="end" font-size="10" fill="#a8939a">${k.toFixed(1)}</text>`}
 const lab=(d,a)=>`<text x="${X(d)}" y="${H-8}" text-anchor="${a}" font-size="10" fill="#a8939a">${+d.slice(5,7)}/${+d.slice(8)}</text>`;
 return `<svg id="wchart" viewBox="0 0 ${W} ${H}" width="100%">${g}<polyline points="${pts}" fill="none" stroke="#e0607e" stroke-width="2.5" stroke-linejoin="round"/>${w.map(x=>`<circle cx="${X(x.date)}" cy="${Y(x.kg)}" r="3.5" fill="#fff" stroke="#e0607e" stroke-width="2"/>`).join('')}${lab(w[0].date,'start')}${w.length>1?lab(w[w.length-1].date,'end'):''}</svg>`}

function openModal(h){$('#sheet').innerHTML=h;$('#modal').hidden=false}
function closeModal(){$('#modal').hidden=true;render()}
function dayModal(d){const t=dnum(d)>dnum(today());openModal(`<h2>${fmtD(d)}</h2><div class="sub">${t?'未来日期不能打卡':'点一下可补打卡/取消'}</div><div id="dayl">${taskList(d)}</div><button class="btn ghost" data-act="close">关闭</button>`);if(t)$('#dayl').style.pointerEvents='none'}
let ed=null;
function suppModal(s){ed=s?JSON.parse(JSON.stringify(s)):{id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:'',dose:'',note:'',slots:['am'],freq:{type:'daily',n:3,start:today(),days:[]},active:true,created:today()};
 if(!ed.freq.start)ed.freq.start=ed.created||today();drawSupp(!!s)}
function drawSupp(isEdit){const f=ed.freq;openModal(`<h2>${isEdit?'编辑补剂':'添加补剂'}</h2>
<label>名称</label><input id="f_name" value="${esc(ed.name)}" placeholder="如 叶酸、DHA、钙片">
<label>每次剂量</label><input id="f_dose" value="${esc(ed.dose)}" placeholder="如 1片、2粒">
<label>吃的时间（可多选）</label><div class="chips" id="f_slots">${SLOTS.map(([id,nm,ic])=>`<button data-slot="${id}" class="${ed.slots.includes(id)?'on':''}">${ic} ${nm}</button>`).join('')}</div>
<label>频次</label><div class="chips" id="f_type">${[['daily','每天'],['alt','隔天'],['everyN','每隔N天'],['weekly','每周固定几天']].map(([v,n])=>`<button data-type="${v}" class="${f.type===v?'on':''}">${n}</button>`).join('')}</div>
${f.type==='everyN'?`<label>每几天吃一次</label><input id="f_n" type="number" inputmode="numeric" min="2" value="${f.n||3}">`:''}
${f.type==='alt'||f.type==='everyN'?`<label>从哪天开始吃（这天算第一次）</label><input id="f_start" type="date" value="${f.start}">`:''}
${f.type==='weekly'?`<label>每周哪几天</label><div class="chips" id="f_days">${[1,2,3,4,5,6,0].map(d=>`<button data-wd="${d}" class="${(f.days||[]).includes(d)?'on':''}">周${WD[d]}</button>`).join('')}</div>`:''}
<label>备注</label><input id="f_note" value="${esc(ed.note)}" placeholder="如 饭后吃、和钙片隔开">
<button class="btn" data-act="savesupp">保存</button>
${isEdit?`<button class="btn ghost" data-act="pause">${ed.active?'暂停服用':'恢复服用'}</button><button class="btn danger" data-act="delsupp">删除</button>`:''}
<button class="btn ghost" data-act="close">取消</button>`);ed._edit=isEdit}
function grab(){for(const k of['name','dose','note']){const e=$('#f_'+k);if(e)ed[k]=e.value.trim()}const n=$('#f_n');if(n)ed.freq.n=parseInt(n.value)||2;const st=$('#f_start');if(st&&st.value)ed.freq.start=st.value}
function commit(){const i=S.supps.findIndex(x=>x.id===ed.id);const o=Object.assign({},ed);delete o._edit;if(i>=0)S.supps[i]=o;else S.supps.push(o);save()}

document.addEventListener('click',e=>{const t=e.target.closest('button,[data-k],[data-edit],[data-day]');if(!t)return;const D=t.dataset;
 if(e.target===$('#modal'))return;
 if(D.tab){tab=D.tab;render();scrollTo(0,0);return}
 if(D.k){toggle(D.date,D.k);if(!$('#modal').hidden){$('#dayl').innerHTML=taskList(D.date)}else render();if(navigator.vibrate)navigator.vibrate(10);return}
 if(D.day){dayModal(D.day);return}
 if(D.edit){suppModal(S.supps.find(s=>s.id===D.edit));return}
 if(D.slot){grab();const a=ed.slots;ed.slots=a.includes(D.slot)?a.filter(x=>x!==D.slot):[...a,D.slot];ed.slots.sort((x,y)=>SLOTS.findIndex(s=>s[0]===x)-SLOTS.findIndex(s=>s[0]===y));drawSupp(ed._edit);return}
 if(D.type){grab();ed.freq.type=D.type;drawSupp(ed._edit);return}
 if(D.wd){grab();const d=+D.wd,a=ed.freq.days||[];ed.freq.days=a.includes(d)?a.filter(x=>x!==d):[...a,d];drawSupp(ed._edit);return}
 if(D.delw){if(confirm('删除这条体重记录？')){S.weights=S.weights.filter(x=>x.date!==D.delw);save();render()}return}
 const A=D.act;if(!A)return;
 if(A==='close')closeModal();
 else if(A==='prevm'||A==='nextm'){let[y,m]=views.m.split('-').map(Number);m+=A==='nextm'?1:-1;if(m<1){m=12;y--}if(m>12){m=1;y++}views.m=`${y}-${pad(m)}`;render()}
 else if(A==='newsupp')suppModal(null);
 else if(A==='savesupp'){grab();if(!ed.name)return toast('请填写名称');if(!ed.slots.length)return toast('请至少选一个时间');if(ed.freq.type==='weekly'&&!(ed.freq.days||[]).length)return toast('请选择每周哪几天');if(ed.freq.type==='everyN'&&ed.freq.n<2)return toast('间隔天数至少为2');commit();closeModal();toast('已保存 ✓')}
 else if(A==='pause'){grab();ed.active=!ed.active;commit();closeModal();toast(ed.active?'已恢复':'已暂停')}
 else if(A==='delsupp'){if(confirm(`确定删除「${ed.name}」？历史打卡记录会保留。`)){S.supps=S.supps.filter(x=>x.id!==ed.id);save();closeModal()}}
 else if(A==='addw'){const d=$('#wd').value,k=parseFloat($('#wk').value);if(!d||!(k>20&&k<300))return toast('请输入正确的体重');S.weights=S.weights.filter(x=>x.date!==d);S.weights.push({date:d,kg:Math.round(k*10)/10});save();render();toast('已记录 ✓')}
 else if(A==='export')doExport();
 else if(A==='import')$('#imp').click();
});
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('change',e=>{if(e.target.id!=='imp')return;const f=e.target.files[0];if(!f)return;f.text().then(t=>{const v=JSON.parse(t);if(!v||!Array.isArray(v.supps))throw 0;if(!confirm('恢复备份会覆盖当前数据，确定吗？'))return;S=norm(v);save();render();toast('恢复成功 ✓')}).catch(()=>toast('文件格式不正确')).finally(()=>e.target.value='')});
async function doExport(){const data=JSON.stringify(Object.assign({app:'pregCheckin',exportedAt:new Date().toISOString()},S),null,1);const name=`孕期打卡备份-${today()}.json`;
 const file=new File([data],name,{type:'application/json'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.remove();toast('已导出')}
let lastDay=today();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&today()!==lastDay){lastDay=today();render()}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
