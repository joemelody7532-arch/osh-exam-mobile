/* 職安勇者 Supabase cloud bridge (v1). No service key, only public publishable key.
   Keeps the original on-device mode untouched until cloud-config.js is filled in. */
(function(){
'use strict';
const cfg=window.OSH_CLOUD_CONFIG||{};
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.url||'')||
   !/^(sb_publishable_|eyJ)/.test(cfg.publishableKey||''))return;

const KEY_PREFIX='OSH_Exam_PWA_v1_cloud_';
const BASE_PREFIX='OSH_Cloud_Baseline_v1_';
let client=null,user=null,profile=null,ready=false,connecting=true;
let base={},version=0,rowExists=false,debounce=null,sending=false,pending=false,lastNotice='',isRefreshing=false;
let mode='login',promptMessage='',authBusy=false;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const clone=x=>JSON.parse(JSON.stringify(x||{}));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=(a,b,fn)=>{const seen=new Set(),out=[];for(const v of [...(a||[]),...(b||[])]){const key=fn?fn(v):JSON.stringify(v);if(!seen.has(key)){seen.add(key);out.push(v)}}return out;};
const acctKey=id=>KEY_PREFIX+id;
const baseKey=id=>BASE_PREFIX+id;
const localData=id=>{try{return JSON.parse(localStorage.getItem(acctKey(id)))||{}}catch{return {}}};
const storedBase=id=>{try{return JSON.parse(localStorage.getItem(baseKey(id)))||{}}catch{return {}}};
const saveLocal=(id,x)=>localStorage.setItem(acctKey(id),JSON.stringify(x));
const touch=()=>window.dispatchEvent(new Event('osh-account-changed'));
function showStatus(message){
 lastNotice=message;
 const n=$('osh-cloud-sync');
 if(n)n.textContent=message;
}
function extractStats(data){
 const answers=(Array.isArray(data.answers)?data.answers:[]);
 const records=Array.isArray(data.records)?data.records:[];
 const adventure=data.adventure||{};
 const correct=answers.filter(x=>x.correct).length;
 const dates=answers.map(x=>x.date).filter(Boolean).sort();
 return {
  answers:answers.length,correct,accuracy:answers.length?Math.round(correct/answers.length*100):0,
  exams:records.length,
  last_exam_score:records.length?Number(records[records.length-1].score||0):null,
  stars:Object.values(adventure.stars||{}).reduce((s,v)=>s+(Number(v)||0),0),
  level:Math.floor((Number(adventure.xp)||0)/180)+1,
  last_practice:dates.length?dates[dates.length-1]:null,
  course:String(data.course||'22000'),
  clears:Number(adventure.clears||0)
 };
}
function mergeState(local,remote,baseline){
 const result=clone(remote);
 for(const [k,v] of Object.entries(local||{})){
  if(['answers','records','favorites','customQuestions','attempts','adventure'].includes(k))continue;
  if(!equal(v,baseline?.[k]))result[k]=clone(v);
 }
 result.answers=unique(remote.answers,local.answers,e=>e?.eventId||JSON.stringify(e));
 result.records=unique(remote.records,local.records,e=>e?.eventId||JSON.stringify(e));
 result.favorites=unique(remote.favorites,local.favorites);
 result.customQuestions=unique(remote.customQuestions,local.customQuestions,e=>e?.id||JSON.stringify(e));
 const tally={};
 for(const a of result.answers){
  if(!a?.date)continue;
  const r=tally[a.date]||(tally[a.date]={total:0,correct:0});
  r.total++;if(a.correct)r.correct++;
 }
 for(const [day,val] of Object.entries({...remote.attempts,...local.attempts})){
  const p=tally[day]||(tally[day]={total:0,correct:0});
  p.total=Math.max(p.total,Number(val?.total||0));
  p.correct=Math.max(p.correct,Number(val?.correct||0));
 }
 result.attempts=tally;
 const r=remote.adventure||{},l=local.adventure||{},b=baseline?.adventure||{};
 const award=field=>Math.max(0,Number(r[field]||0)+(Number(l[field]||0)-Number(b[field]||0)));
 result.adventure={...r,...l,
  xp:award('xp'),coins:award('coins'),clears:award('clears'),
  stars:{...r.stars}};
 for(const [stage,stars] of Object.entries(l.stars||{}))result.adventure.stars[stage]=Math.max(Number(result.adventure.stars[stage]||0),Number(stars||0));
 result.adventure.items={...r.items,...l.items};
 return result;
}
const clientPromise=new Promise((resolve,reject)=>{
 if(window.supabase?.createClient)return resolve(window.supabase);
 const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';s.async=true;
 s.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(Error('Supabase 程式未正確載入'));
 s.onerror=()=>reject(Error('登入服務載入失敗，請檢查連線或廣告阻擋設定'));
 document.head.appendChild(s);
});

const bridge={
 activeId:()=>ready&&user?.id||null,
 activeName:()=>ready?(profile?.display_name||user?.email||'學員'):'',
 activeKey:()=>ready&&user?.id?acctKey(user.id):null,
 show:()=>renderAuth(),
 logout:()=>signOut(),
 accounts:()=>ready&&user?[{id:user.id,name:profile?.display_name||user.email}]:[]
};
window.oshLocalAccounts=bridge;
window.oshCloud={enabled:true,activeId:bridge.activeId,activeName:bridge.activeName,scheduleSync,flush:()=>syncNow(),status:()=>lastNotice,settingsPanel,refresh:pull,client:()=>client,role:()=>profile?.role||'student',logout:signOut,stats:extractStats,mergeState};

function renderAuth(){
 const host=$('app');if(!host)return;
 const status=connecting?'正在連線雲端登入服務…':promptMessage;
 host.innerHTML='<div class="app"><main class="osh-account-page">'+
 '<div class="osh-auth-mark">🐾</div><div class="osh-auth-title">職安勇者</div>'+
 '<p class="osh-auth-sub">柴犬財財・雲端學員帳號</p>'+
 '<div class="osh-auth-card"><div class="osh-auth-tabs">'+
 '<button data-cloud-mode="login" class="'+(mode==='login'?'active':'')+'">登入</button>'+
 '<button data-cloud-mode="signup" class="'+(mode==='signup'?'active':'')+'">註冊</button>'+
 '<button data-cloud-mode="reset" class="'+(mode==='reset'?'active':'')+'">忘記密碼</button></div>'+
 (status?'<p class="osh-auth-message" role="status">'+esc(status)+'</p>':'')+
 '<form id="cloud-auth-form" autocomplete="on">'+
 (mode==='signup'?'<label for="cloud-name">暱稱</label><input id="cloud-name" maxlength="40" required placeholder="例如：職安勇者小明">':'')+
 '<label for="cloud-email">電子郵件</label><input id="cloud-email" type="email" autocomplete="username" required placeholder="name@example.com">'+
 (mode==='reset'?'':'<label for="cloud-pass">帳號密碼（至少 8 個字元）</label><input id="cloud-pass" type="password" autocomplete="'+(mode==='signup'?'new-password':'current-password')+'" minlength="8" required>')+
 '<button class="osh-submit" type="submit" '+(authBusy||connecting?'disabled':'')+'>'+
 (connecting?'連線中…':mode==='signup'?'建立雲端帳號':mode==='reset'?'寄送密碼重設信':'登入我的學習紀錄')+
 '</button></form></div><div class="osh-auth-tip"><strong>跨手機同步已準備好</strong>'+
 '<p>雲端帳號以 Email＋密碼登入；資料庫會依帳號隔離作答及闖關進度。</p>'+
 '<p>管理員可以查看學習成果，其他學員無法讀取你的個人成績。</p>'+
 '<p>舊版本機進度不會自動轉移：請先從本機版匯出備份，再登入雲端版匯入。</p></div></main></div>';
 document.querySelectorAll('[data-cloud-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.cloudMode;promptMessage='';renderAuth()});
 $('cloud-auth-form').onsubmit=submitAuth;
}
async function submitAuth(e){
 e.preventDefault();if(authBusy||connecting||!client)return;
 authBusy=true;promptMessage='處理中…';renderAuth();
 // Values were replaced by re-render; use values from submitter's original form instead.
 // Deprecated helper kept as no-op; active handler is authSubmit.
 authBusy=false;
}
// Overrides submitAuth with direct capture before painting.
async function authSubmit(e){
 e.preventDefault();if(authBusy||connecting||!client)return;
 const mail=$('cloud-email').value.trim().toLowerCase();
 const pass=$('cloud-pass')?.value||'';
 const name=$('cloud-name')?.value.trim()||'職安勇者';
 authBusy=true;promptMessage='正在驗證…';const m=mode;renderAuth();
 try{
  if(m==='signup'){
   const {data,error}=await client.auth.signUp({email:mail,password:pass,options:{data:{display_name:name},emailRedirectTo:cfg.redirectUrl||location.origin+location.pathname}});
   if(error)throw error;
   if(data.session)await adopt(data.session.user);
   else {mode='login';promptMessage='已送出註冊，請先至 Email 收信完成驗證，再返回登入。';}
  }else if(m==='reset'){
   const {error}=await client.auth.resetPasswordForEmail(mail,{redirectTo:cfg.redirectUrl||location.origin+location.pathname});
   if(error)throw error;
   mode='login';promptMessage='如果帳號存在，系統會寄送密碼重設信。';
  }else{
   const {data,error}=await client.auth.signInWithPassword({email:mail,password:pass});
   if(error)throw error;
   await adopt(data.user);
  }
 }catch(err){promptMessage='無法完成：'+String(err?.message||err).slice(0,180)}
 finally{authBusy=false;if(!ready)renderAuth()}
}
// Attach correct handler after each auth rerender.
const rawRender=renderAuth;
renderAuth=function(){
 rawRender();
 const form=$('cloud-auth-form');
 if(form)form.onsubmit=authSubmit;
};

async function adopt(next){
 if(!next?.id)return;
 connecting=true;promptMessage='正在讀取雲端學習進度…';renderAuth();
 try{
  const info=await client.from('learner_profiles').select('display_name,role').eq('user_id',next.id).single();
  if(info.error)throw info.error;
  const result=await client.from('learner_progress').select('data,version').eq('user_id',next.id).maybeSingle();
  if(result.error)throw result.error;
  const cloudState=result.data?.data||{},cloudVersion=Number(result.data?.version||0);
  const local=localData(next.id),previous=storedBase(next.id),older=previous.data||{};
  const locallyModified=localStorage.getItem(acctKey(next.id))&& !equal(local,older);
  const nextState=locallyModified?mergeState(local,cloudState,older):cloudState;
  saveLocal(next.id,nextState);
  base=clone(cloudState);version=cloudVersion;rowExists=!!result.data;
  localStorage.setItem(baseKey(next.id),JSON.stringify({data:base,version}));
  user=next;profile=info.data;ready=true;connecting=false;showStatus(locallyModified?'有尚待上傳的學習資料':'雲端進度已同步');
  touch();
  if(locallyModified)scheduleSync();
 }catch(err){connecting=false;ready=false;user=null;promptMessage='無法讀取雲端進度，請檢查資料庫或網路：'+String(err?.message||err).slice(0,200);renderAuth()}
}
function scheduleSync(){
 if(!ready||!user)return;
 pending=true;showStatus(navigator.onLine?'⏳ 等待同步':'📴 離線，待同步');
 clearTimeout(debounce);
 debounce=setTimeout(()=>syncNow(),1500);
}
async function syncNow(){
 if(!client||!ready||!user||sending)return false;
 const userId=user.id,snapshot=localData(userId);
 if(!pending && equal(snapshot,base))return true;
 sending=true;showStatus('⏳ 正在同步');
 try{
  let candidate=clone(snapshot),baseForMerge=clone(base),targetVersion=version,targetExists=rowExists;
  for(let retry=0;retry<4;retry++){
   let savedRow=null;
   if(!targetExists){
    // INSERT when no row exists; conflicting first writes are merged on retry.
    const r=await client.from('learner_progress').insert({user_id:userId,data:candidate,stats:extractStats(candidate)}).select('version').maybeSingle();
    if(!r.error)savedRow=r.data;
    else if(r.error.code!=='23505')throw r.error;
   }else{
    const r=await client.from('learner_progress').update({data:candidate,stats:extractStats(candidate)})
      .eq('user_id',userId).eq('version',targetVersion).select('version').maybeSingle();
    if(r.error)throw r.error;
    savedRow=r.data;
   }
   if(savedRow){
    if(user?.id!==userId)return false;
    version=Number(savedRow.version);rowExists=true;base=clone(candidate);
    localStorage.setItem(baseKey(userId),JSON.stringify({data:base,version}));
    const newer=localData(userId);
    if(equal(newer,snapshot)){saveLocal(userId,candidate);pending=false;}
    else {pending=true;scheduleSync();}
    showStatus(pending?'⏳ 還有未同步紀錄':'✅ 雲端已同步');
    return true;
   }
   const r=await client.from('learner_progress').select('data,version').eq('user_id',userId).maybeSingle();
   if(r.error)throw r.error;
   candidate=mergeState(candidate,r.data?.data||{},baseForMerge);
   targetVersion=Number(r.data?.version||0);targetExists=!!r.data;
   baseForMerge=clone(r.data?.data||{});
  }
  throw Error('多裝置同時更新，請稍後重試');
 }catch(err){pending=true;showStatus('⚠️ 同步未成功；本機保留，稍後重試');console.warn('[OSH Cloud] progress sync delayed',err?.message||err);return false}
 finally{sending=false}
}
async function pull(){
 if(!ready||!user||isRefreshing||sending||document.visibilityState==='hidden')return;
 isRefreshing=true;
 try{
  if(pending||!equal(localData(user.id),base)){await syncNow();return}
  const r=await client.from('learner_progress').select('data,version').eq('user_id',user.id).maybeSingle();
  if(r.error)throw r.error;
  const latest=Number(r.data?.version||0);
  if(latest!==version){
   const id=user.id;version=latest;base=clone(r.data?.data||{});
   saveLocal(id,base);localStorage.setItem(baseKey(id),JSON.stringify({data:base,version}));touch();
  }
  showStatus('✅ 雲端已同步');
 }catch(err){showStatus('⚠️ 雲端目前連線異常')}
 finally{isRefreshing=false}
}
async function signOut(){
 if(!client)return;
 if(pending){await syncNow();if(pending&&!confirm('仍有尚未同步的紀錄，現在登出可能無法在另一部手機看到最新資料。確定登出？'))return}
 clearTimeout(debounce);pending=false;ready=false;user=null;profile=null;connecting=false;
 try{await client.auth.signOut()}catch{}
 mode='login';promptMessage='已登出。';touch();
}
function settingsPanel(){
 if(!ready)return '';
 return '<div class="osh-settings-account"><strong>☁️ 雲端同步：<span id="osh-cloud-sync">'+esc(lastNotice||'準備中')+'</span></strong>'+
 '<p>👤 '+esc(profile?.display_name||user.email)+' · '+esc(user.email||'')+
 '<br>學習進度可在不同手機使用同一電子郵件帳號同步。</p>'+
 '<button class="osh-signout" type="button" data-cloud-action="sync">現在同步</button>　'+
 (profile?.role==='admin'?'<a href="./admin.html" class="osh-signout">管理者儀表板</a>':'')+
 '</div>';
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-cloud-action]');
 if(el?.dataset.cloudAction==='sync')syncNow();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull()});
window.addEventListener('online',()=>{if(pending)syncNow();else pull()});
let lastPull=0;
window.addEventListener('focus',()=>{if(Date.now()-lastPull>30000){lastPull=Date.now();pull()}});

async function init(){
 try{
  const sdk=await clientPromise;
  client=sdk.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{headers:{'X-Client-Info':'osh-hero-v6'}}});
  connecting=false;
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(data?.session?.user)await adopt(data.session.user);
  else {promptMessage='請登入你的雲端學員帳號。';renderAuth()}
  client.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT'&&ready){ready=false;user=null;profile=null;touch();}
   else if(event==='SIGNED_IN'&&session?.user&&session.user.id!==user?.id){
    setTimeout(()=>adopt(session.user),0);
   }
  });
 }catch(err){connecting=false;promptMessage='無法連線登入服務：'+String(err?.message||err).slice(0,200);renderAuth()}
}
init();
})();