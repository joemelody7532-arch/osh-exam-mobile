/* 職安勇者｜雲端管理者儀表板
   Security: UI checks are convenience only. PostgreSQL RLS and server-side role assignment
   prevent students from reading other users, even when they directly call the API. */
(async function(){
'use strict';
const root=document.getElementById('admin-root'),cfg=window.OSH_CLOUD_CONFIG||{};
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const money=n=>Number(n||0).toLocaleString('zh-TW');
const parsedDate=x=>{const d=new Date(x||0);return isNaN(d.getTime())?'尚無紀錄':d.toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
const percent=(a,b)=>b?Math.round(a/b*100):0;
const setHTML=html=>root.innerHTML=html;
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url||'')||!/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||'')){
 setHTML('<div class="admin-panel"><h1>🔧 管理者後台待啟用</h1><p>網站介面已部署，但尚未連接你的 Supabase 專案。</p><p>須先執行 <code>supabase/migrations/20261020_osh_cloud.sql</code> 並設定 <code>cloud/cloud-config.js</code> 的公開 Project URL 和 publishable key。</p><a href="./index.html">回到目前本機版</a></div>');
 return;
}
let sdk;
try{
 sdk=await new Promise((resolve,reject)=>{
  if(window.supabase?.createClient)return resolve(window.supabase);
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(Error('SDK 無法初始化'));
  script.onerror=()=>reject(Error('連線失敗，無法載入登入服務'));document.head.appendChild(script);
 });
}catch(e){setHTML('<div class="admin-panel"><h1>連線失敗</h1><p>'+escapeHTML(e.message)+'</p></div>');return;}
const supabase=sdk.createClient(cfg.url,cfg.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
let data=[],filter='',course='all',period='all',currentUser=null;
function loginScreen(message=''){
 setHTML('<section class="admin-panel auth-card"><h1>🔐 管理者登入</h1><p>請使用已授權為管理者的雲端學員帳號登入；學員登入後不會獲得後台權限。</p>'+
 (message?'<p class="alert">'+escapeHTML(message)+'</p>':'')+
 '<form id="admin-login"><label for="admin-email">電子郵件</label><input id="admin-email" type="email" autocomplete="username" required>'+
 '<label for="admin-pass">密碼</label><input id="admin-pass" type="password" autocomplete="current-password" required>'+
 '<button class="primary" type="submit">驗證管理權限並登入</button></form></section>');
 document.getElementById('admin-login').onsubmit=async e=>{
  e.preventDefault();
  const email=document.getElementById('admin-email').value.trim();
  const password=document.getElementById('admin-pass').value;
  setHTML('<div class="admin-panel">正在驗證權限…</div>');
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)loginScreen('登入失敗：'+error.message);
  else await load();
 };
}
async function load(){
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth?.user){loginScreen();return;}
 currentUser=auth.user;
 const info=await supabase.from('learner_profiles').select('role,display_name').eq('user_id',currentUser.id).single();
 if(info.error||info.data?.role!=='admin'){
  setHTML('<section class="admin-panel"><h1>🔒 無權限存取</h1><p>此帳號沒有管理者權限。請由資料庫管理者於 Supabase SQL Editor 指派。</p><button id="admin-signout">登出</button></section>');
  document.getElementById('admin-signout').onclick=async()=>{await supabase.auth.signOut();loginScreen()};
  return;
 }
 setHTML('<section class="admin-panel"><h2>正在讀取學員成績…</h2><p>已驗證管理員：'+escapeHTML(info.data.display_name)+'</p></section>');
 await fetchData();
}
async function fetchPaged(table,columns){
 let out=[],start=0;
 for(let i=0;i<10;i++){
  const {data:part,error}=await supabase.from(table).select(columns).range(start,start+499);
  if(error)throw error;
  out.push(...(part||[]));if(!part||part.length<500)break;
  start+=500;
 }
 return out;
}
async function fetchData(){
 try{
  const [profiles,progress]=await Promise.all([
    fetchPaged('learner_profiles','user_id,display_name,role,created_at'),
    fetchPaged('learner_progress','user_id,stats,data,updated_at')
  ]);
  const byId=new Map(progress.map(x=>[x.user_id,x]));
  data=profiles.map(p=>{
   const item=byId.get(p.user_id),stats=item?.stats||{},state=item?.data||{};
   const answers=Array.isArray(state.answers)?state.answers:[];
   const records=Array.isArray(state.records)?state.records:[];
   const adventure=state.adventure||{};
   const correct=answers.reduce((n,a)=>n+(a.correct?1:0),0);
   const dates=[...answers].filter(a=>a.date).map(a=>a.date).sort();
   return {...p,answers:answers.length,correct,accuracy:percent(correct,answers.length),
    records:records.length, lastExam:records.length?Number(records[records.length-1].score||0):null,
    stars:Object.values(adventure.stars||{}).reduce((n,x)=>n+Number(x||0),0),
    level:Math.floor((Number(adventure.xp)||0)/180)+1,
    clears:Number(adventure.clears||0),course:state.course||'22000',
    lastPractice:dates[dates.length-1]||null,
    updated:item?.updated_at||null,
    rawAnswers:answers};
  });
  render();
 }catch(err){
  setHTML('<section class="admin-panel"><h1>無法讀取學員資料</h1><p>'+escapeHTML(err?.message||err)+'</p><button id="retry">重試</button></section>');
  document.getElementById('retry').onclick=fetchData;
 }
}
function filtered(){
 let list=data.filter(x=>x.display_name.toLowerCase().includes(filter.toLowerCase())||x.user_id.toLowerCase().includes(filter.toLowerCase()));
 if(course!=='all')list=list.filter(x=>x.course===course);
 if(period!=='all'){
  const days=Number(period),cutoff=Date.now()-days*86400000;
  list=list.filter(x=>x.updated&&new Date(x.updated).getTime()>=cutoff);
 }
 return list.sort((a,b)=>new Date(b.updated||0)-new Date(a.updated||0));
}
function statsOf(list){
 const count=list.length,active=list.filter(x=>x.updated&&Date.now()-new Date(x.updated).getTime()<7*86400000).length;
 const total=list.reduce((n,x)=>n+x.answers,0),correct=list.reduce((n,x)=>n+x.correct,0);
 const mock=list.reduce((n,x)=>n+x.records,0);
 return {count,active,total,accuracy:percent(correct,total),mock};
}
function chartData(list){
 const days=Array.from({length:7},(_,i)=>{let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-6+i);
  return {date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),label:(d.getMonth()+1)+'/'+d.getDate(),count:0};
 });
 const lookup=new Map(days.map(x=>[x.date,x]));
 for(const p of list)for(const a of p.rawAnswers||[]){const day=lookup.get(a.date);if(day)day.count++;}
 const maximum=Math.max(1,...days.map(x=>x.count));
 return '<div class="activity-chart">'+days.map(d=>'<div class="day"><span>'+money(d.count)+'</span><div class="bar-outer"><div class="bar" style="height:'+Math.max(4,Math.round(d.count/maximum*100))+'%"></div></div><small>'+escapeHTML(d.label)+'</small></div>').join('')+'</div>';
}
function render(){
 const list=filtered(),st=statsOf(list);
 setHTML('<section class="admin-heading"><div><p>OSH LEARNING CENTER</p><h1>學員成績儀表板</h1><small>☁️ 已登入 '+escapeHTML(currentUser?.email||'')+'</small></div><div class="actions"><button id="reload">⟳ 更新</button><button id="csv">⬇ 匯出 CSV</button><button id="signout">登出</button></div></section>'+
 '<section class="metric-grid">'+
 [['👥','學員人數',money(st.count)],['🟢','7日活躍學員',money(st.active)],['📝','累計作答題數',money(st.total)],['🎯','整體正確率',st.accuracy+'%'],['🏆','模擬考場次',money(st.mock)]]
 .map(a=>'<article class="metric"><span>'+a[0]+'</span><small>'+a[1]+'</small><b>'+a[2]+'</b></article>').join('')+'</section>'+
 '<section class="admin-panel"><h2>最近七天答題活動</h2><p class="help">計算已同步的學員答題紀錄</p>'+chartData(list)+'</section>'+
 '<section class="admin-panel"><h2>全體學員學習明細</h2><div class="filters">'+
 '<input id="filter-name" placeholder="搜尋學員暱稱／帳號 ID" value="'+escapeHTML(filter)+'">'+
 '<select id="course-filter">'+[['all','全部證照'],['22000','甲級職業安全'],['22100','甲級職業衛生'],['22200','乙級職安衛']].map(x=>'<option value="'+x[0]+'" '+(course===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select>'+
 '<select id="period-filter">'+[['all','全部時間'],['7','近7日有同步'],['30','近30日有同步']].map(x=>'<option value="'+x[0]+'" '+(period===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
 '<div class="scroll"><table><thead><tr><th>學員</th><th>證照</th><th>練題量</th><th>正確率</th><th>模擬考</th><th>Lv.</th><th>星星</th><th>最後同步</th></tr></thead><tbody>'+
 list.map(x=>'<tr><td><b>'+escapeHTML(x.display_name)+'</b><small>'+escapeHTML(x.role==='admin'?'管理者':'學員')+'</small></td>'+
 '<td>'+escapeHTML(({22000:'甲安',22100:'甲衛',22200:'乙級'})[x.course]||x.course)+'</td>'+
 '<td>'+money(x.answers)+'</td><td><span class="pct">'+x.accuracy+'%</span></td><td>'+money(x.records)+'</td><td>'+x.level+'</td><td>⭐ '+x.stars+'</td><td>'+parsedDate(x.updated)+'</td></tr>').join('')+
 '</tbody></table></div><p class="help">目前符合條件 '+list.length+' 人。資料僅供學習追蹤，非官方考試成績。</p></section>');
 document.getElementById('reload').onclick=fetchData;
 document.getElementById('signout').onclick=async()=>{await supabase.auth.signOut();loginScreen('已登出。')};
 document.getElementById('csv').onclick=()=>downloadCSV(list);
 document.getElementById('filter-name').oninput=e=>{filter=e.target.value;let start=e.target.selectionStart;render();let node=document.getElementById('filter-name');node.focus();node.setSelectionRange(start,start)};
 document.getElementById('course-filter').onchange=e=>{course=e.target.value;render()};
 document.getElementById('period-filter').onchange=e=>{period=e.target.value;render()};
}
function csvSafe(v){const s=String(v??'');return '"'+(/^[=+\-@\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"'}
function downloadCSV(rows){
 const headers=['學員','證照','題數','答對','正確率','模擬考次數','最近模擬分數','闖關等級','星星','過關數','最後練習日期','最後同步'];
 const textRows=rows.map(x=>[x.display_name,x.course,x.answers,x.correct,x.accuracy+'%',x.records,x.lastExam,x.level,x.stars,x.clears,x.lastPractice,x.updated]);
 const csv='\ufeff'+[headers,...textRows].map(row=>row.map(csvSafe).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='職安勇者_學員績效_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
await load();
})();