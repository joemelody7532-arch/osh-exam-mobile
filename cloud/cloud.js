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
let base={},version=0,rowExists=false,debounce=null,sending=false,pending=false,lastNotice='',isRefreshing=false,adoptingId=null;
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
 result.adventure={...r};
 for(const [key,value] of Object.entries(l))if(!['xp','coins','clears','stars','items'].includes(key)&&!equal(value,b[key]))result.adventure[key]=clone(value);
 result.adventure.xp=award('xp');result.adventure.coins=award('coins');result.adventure.clears=award('clears');result.adventure.stars={...r.stars};
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
 (mode==='newpass'?'':'<label for="cloud-email">電子郵件</label><input id="cloud-email" type="email" autocomplete="username" required placeholder="name@example.com">')+
 (mode==='reset'?'':'<label for="cloud-pass">'+(mode==='newpass'?'設定新密碼':'帳號密碼（至少 8 個字元）')+'</label><input id="cloud-pass" type="password" autocomplete="'+(mode==='signup'||mode==='newpass'?'new-password':'current-password')+'" minlength="8" required>')+
 (mode==='newpass'?'<label for="cloud-pass-confirm">再次輸入新密碼</label><input id="cloud-pass-confirm" type="password" minlength="8" required>':'')+
 '<button class="osh-submit" type="submit" '+(authBusy||connecting?'disabled':'')+'>'+
 (connecting?'連線中…':mode==='signup'?'建立雲端帳號':mode==='reset'?'寄送密碼重設信':mode==='newpass'?'儲存新密碼':'登入我的學習紀錄')+
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
 const mail=$('cloud-email')?.value.trim().toLowerCase()||'';
 const pass=$('cloud-pass')?.value||'';
 const name=$('cloud-name')?.value.trim()||'職安勇者';
 authBusy=true;promptMessage='正在驗證…';const m=mode;renderAuth();
 try{
  if(m==='newpass'){
   if(pass!==$('cloud-pass-confirm')?.value)throw Error('兩次輸入的密碼不一致');
   const {error}=await client.auth.updateUser({password:pass});if(error)throw error;
   mode='login';promptMessage='新密碼已設定完成。請使用新密碼登入。';
   await client.auth.signOut();
  }else if(m==='signup'){
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
 if(!next?.id||adoptingId===next.id)return;
 adoptingId=next.id;
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
 finally{adoptingId=null}
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

/* One-time migration of an existing local PIN-protected learner, only with
   that learner's PIN. Never automatically import another learner's data. */
function localProfiles(){
 try{
  const db=JSON.parse(localStorage.getItem('OSH_LOCAL_ACCOUNTS_v1')||'null');
  return Array.isArray(db?.profiles)?db.profiles.filter(p=>p?.id&&p?.name&&p?.salt&&p?.digest):[];
 }catch{return []}
}
async function localPinValid(pin,p){
 if(!/^[0-9]{6,12}$/.test(pin))return false;
 const saltBytes=new Uint8Array((p.salt.match(/.{2}/g)||[]).map(h=>parseInt(h,16)));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 const digest=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:140000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')===p.digest;
}
async function migrateLocalLearner(){
 const el=$('osh-import-local'),pin=$('osh-import-pin');
 if(!ready||!user||!el||!pin)return;
 const profileId=el.value,record=localProfiles().find(x=>x.id===profileId);
 if(!record)return alert('找不到所選的舊版本機檔案。');
 const importedKey='OSH_Cloud_Migrated_Local_v1_'+record.id;
 if(localStorage.getItem(importedKey))return alert('此本機檔案已經安排轉入雲端，為避免重複計算成績，不可再次匯入。');
 try{
  if(!await localPinValid(pin.value,record))throw Error('舊版 PIN 不正確。');
  const raw=localStorage.getItem('OSH_Exam_PWA_v1_user_'+record.id);
  if(!raw)throw Error('原手機找不到此帳號的答題進度。');
  const old=JSON.parse(raw);
  if(!old||typeof old!=='object')throw Error('原始備份格式有誤。');
  if(!confirm('要將「'+record.name+'」的本機練習成果匯入目前登入的雲端帳號 '+user.email+' 嗎？此操作不可重複，請確認是本人資料。'))return;
  const merged=mergeState(old,localData(user.id),{});
  // Reserve before any upload so retrying never double-counts XP/coins.
  localStorage.setItem(importedKey,user.id);
  saveLocal(user.id,merged);
  pending=true;
  showStatus('⏳ 已加入本機資料，正在上傳雲端');
  const ok=await syncNow();
  pin.value='';
  touch();
  alert(ok?'已完成舊版資料匯入與雲端同步。':'已加入本機待同步紀錄。網路恢復時會自動上傳，請不要再次匯入。');
 }catch(e){pin.value='';alert('匯入失敗：'+String(e?.message||e))}
}

function settingsPanel(){
 if(!ready)return '';
 return '<div class="osh-settings-account"><strong>☁️ 雲端同步：<span id="osh-cloud-sync">'+esc(lastNotice||'準備中')+'</span></strong>'+
 '<p>👤 '+esc(profile?.display_name||user.email)+' · '+esc(user.email||'')+
 '<br>學習進度可在不同手機使用同一電子郵件帳號同步。</p>'+
 '<button class="osh-signout" type="button" data-cloud-action="sync">現在同步</button>　'+
 (profile?.role==='admin'?'<a href="./admin.html" class="osh-signout">管理者儀表板</a>':'')+
 '</div>'+
 (localProfiles().length?'<div class="osh-settings-account"><strong>📦 舊版本機學員進度轉入雲端</strong><p>只能匯入同一支手機內的舊帳號。須輸入該學員原本的 PIN，不會自動讀取其他人的進度；每個本機檔案只可轉移一次。</p><label for="osh-import-local">舊版學員</label><select id="osh-import-local">'+localProfiles().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select><label for="osh-import-pin">舊版 PIN 碼</label><input id="osh-import-pin" type="password" inputmode="numeric" minlength="6" maxlength="12"><button class="osh-signout" type="button" data-cloud-action="migrate">驗證並轉移舊進度</button></div>':'');
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-cloud-action]');
 if(el?.dataset.cloudAction==='sync')syncNow();
 if(el?.dataset.cloudAction==='migrate')migrateLocalLearner();
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
   else if(event==='PASSWORD_RECOVERY'){mode='newpass';promptMessage='請輸入新密碼完成重設。';ready=false;user=null;renderAuth()}
   else if(event==='SIGNED_IN'&&mode!=='newpass'&&session?.user&&session.user.id!==user?.id){
    setTimeout(()=>adopt(session.user),0);
   }
  });
 }catch(err){connecting=false;promptMessage='無法連線登入服務：'+String(err?.message||err).slice(0,200);renderAuth()}
}
init();
})();