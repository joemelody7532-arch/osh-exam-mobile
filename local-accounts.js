/* 職安勇者 - 同一瀏覽器本機獨立學習檔案 v5
   GitHub Pages is static: no server-side identity verification or cloud sync.
   Salted PBKDF2 PIN protects ordinary account switching, not developer access
   to browser storage. Do not store sensitive data in learning profiles. */
(function(){
'use strict';
const REGISTRY_KEY='OSH_LOCAL_ACCOUNTS_v1';
const ACTIVE_KEY='OSH_ACTIVE_LOCAL_ID_v1';
const LEGACY_KEY='OSH_Exam_PWA_v1';
const DATA_PREFIX='OSH_Exam_PWA_v1_user_';
let mode='signin', selected='', failed={}, pending=false;
const $=id=>document.getElementById(id);
const h=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const emptyDb=()=>({version:1,profiles:[],legacyClaimedBy:null});
function registry(){
 try {
  const db=JSON.parse(localStorage.getItem(REGISTRY_KEY));
  if(db&&Array.isArray(db.profiles))return db;
 }catch{}
 return emptyDb();
}
function storeDb(db){localStorage.setItem(REGISTRY_KEY,JSON.stringify(db));}
function activeId(){
 try{
  const id=sessionStorage.getItem(ACTIVE_KEY);
  return registry().profiles.some(p=>p.id===id)?id:null;
 }catch{return null}
}
function activeName(){const id=activeId();return registry().profiles.find(x=>x.id===id)?.name||''}
function activeKey(){const id=activeId();return id?DATA_PREFIX+id:null}
function accounts(){return registry().profiles.map(p=>({id:p.id,name:p.name}))}
function cryptoReady(){return !!(window.crypto?.subtle&&window.crypto?.getRandomValues)}
function salt(){const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
function hexBytes(hex){return new Uint8Array((hex.match(/.{2}/g)||[]).map(x=>parseInt(x,16)))}
async function derive(pin,s){
 if(!cryptoReady())throw Error('此瀏覽器不支援安全驗證，請使用更新版 Safari 或 Chrome。');
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
 const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexBytes(s),iterations:140000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
function signal(){window.dispatchEvent(new Event('osh-account-changed'))}
function feedback(s){const e=$('osh-auth-error');if(e){e.textContent=s;e.hidden=!s}}
function setBusy(value){pending=value;document.querySelectorAll('.osh-account-page button').forEach(x=>x.disabled=value)}
function showMode(next){mode=next;show()}
function view(){
 const db=registry(),users=db.profiles;
 const recovery=(!db.legacyClaimedBy && !!localStorage.getItem(LEGACY_KEY));
 const onSignup=mode==='signup'||!users.length;
 let optionTags=users.map(p=>'<option value="'+h(p.id)+'" '+(selected===p.id?'selected':'')+'>'+h(p.name)+'</option>').join('');
 return '<div class="app"><main class="osh-account-page">'+
 '<div class="osh-auth-mark">🐾</div><div class="osh-auth-title">職安勇者</div><p class="osh-auth-sub">黑柴財財・個人練習進度登入</p>'+
 '<section class="osh-auth-card"><div class="osh-auth-tabs">'+
 '<button type="button" class="'+(!onSignup?'active':'')+'" data-auth-tab="signin" '+(!users.length?'disabled':'')+'>登入個人檔案</button>'+
 '<button type="button" class="'+(onSignup?'active':'')+'" data-auth-tab="signup">建立新檔案</button></div>'+
 (onSignup?
  '<form id="osh-signup" autocomplete="off"><label for="osh-new-name">使用者暱稱</label>'+
  '<input id="osh-new-name" name="nickname" maxlength="20" minlength="1" required placeholder="例：財財、Joe、同事A">'+
  '<label for="osh-new-pin">自訂 6～12 位數 PIN 碼</label><input id="osh-new-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="new-password" required minlength="6" maxlength="12" placeholder="僅供本機切換檔案使用">'+
  '<label for="osh-new-confirm">再輸入一次 PIN</label><input id="osh-new-confirm" type="password" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="new-password" required minlength="6" maxlength="12" placeholder="確認 PIN">'+
  (recovery?'<label class="osh-checkbox"><input id="osh-claim-legacy" type="checkbox" checked>將本瀏覽器原有的答題與闖關紀錄歸入此檔案（僅可執行一次）</label>':'')+
  '<button class="osh-submit" type="submit">🐕 建立並開始冒險</button></form>':
  '<form id="osh-signin" autocomplete="off"><label for="osh-account-select">選擇個人檔案</label>'+
  '<select id="osh-account-select" required>'+optionTags+'</select>'+
  '<label for="osh-login-pin">登入 PIN 碼</label><input id="osh-login-pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" autocomplete="off" required placeholder="請輸入自己的 PIN">'+
  '<button class="osh-submit" type="submit">🔓 登入，繼續我的練習</button></form>')+
 '<p id="osh-auth-error" class="osh-error" role="alert" hidden></p></section>'+
 '<div class="osh-auth-tip"><strong>每個人的進度獨立保存</strong><p>答題、錯題、甲級闖關、等級、星星、金幣和備份不會和其他檔案混用。</p>'+
 '<p>⚠️ 此為<strong>本機個人檔案</strong>，不是雲端會員帳號。不同手機／瀏覽器不會自動同步；PIN 不是專業安全防護，請勿儲存敏感個資。更換手機請先匯出進度。</p></div></main></div>';
}
function show(){const mount=$('app');if(!mount)return;mount.innerHTML=view();bind();}
function bind(){
 document.querySelectorAll('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>showMode(b.dataset.authTab)));
 $('osh-signup')?.addEventListener('submit',async e=>{
  e.preventDefault();if(pending)return;
  const name=$('osh-new-name').value.trim(),pin=$('osh-new-pin').value,confirmPin=$('osh-new-confirm').value,claim=!!$('osh-claim-legacy')?.checked;
  if(!name||name.length>20){feedback('暱稱長度請控制在 1～20 字。');return}
  if(!/^[0-9]{6,12}$/.test(pin)||pin!==confirmPin){feedback('PIN 必須是 6～12 位數字，兩次輸入須一致。');return}
  if(registry().profiles.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())){feedback('暱稱已經有人使用，請選擇其他名稱。');return}
  setBusy(true);
  try{
   const db=registry();if(db.profiles.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('暱稱已存在，請重新輸入。');
   const id=crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
   const psalt=salt(),digest=await derive(pin,psalt);
   const record={id,name,salt:psalt,digest,createdAt:new Date().toISOString()};
   let inherited=null;
   if(claim&&!db.legacyClaimedBy){
    try{inherited=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null')}catch{}
   }
   // Write account-specific progress before making the profile selectable.
   localStorage.setItem(DATA_PREFIX+id,JSON.stringify(inherited&&typeof inherited==='object'?inherited:{}));
   db.profiles.push(record);
   if(claim&&inherited)db.legacyClaimedBy=id;
   storeDb(db);
   sessionStorage.setItem(ACTIVE_KEY,id);
   selected=id;
   signal();
  }catch(err){feedback('建立失敗：'+(err?.message||'儲存空間可能不足'))}
  finally{setBusy(false)}
 });
 $('osh-signin')?.addEventListener('submit',async e=>{
  e.preventDefault();if(pending)return;
  const id=$('osh-account-select').value,pin=$('osh-login-pin').value,db=registry(),rec=db.profiles.find(p=>p.id===id);
  if(!rec){feedback('找不到此個人檔案。');return}
  const info=failed[id]||{count:0,until:0};
  if(info.until>Date.now()){feedback('輸入錯誤次數過多，請稍候再試。');return}
  setBusy(true);
  try{
   const test=await derive(pin,rec.salt);
   if(test!==rec.digest){
    info.count++;
    if(info.count>=5){info.count=0;info.until=Date.now()+30000}
    failed[id]=info;
    feedback('PIN 錯誤，請確認選擇了自己的檔案。');
    return;
   }
   delete failed[id];
   selected=id;sessionStorage.setItem(ACTIVE_KEY,id);
   signal();
  }catch(err){feedback('登入失敗：'+err.message)}
  finally{setBusy(false)}
 });
 $('osh-account-select')?.addEventListener('change',e=>{selected=e.target.value});
}
function logout(){
 try{sessionStorage.removeItem(ACTIVE_KEY)}catch{}
 mode='signin';signal();
}
window.oshLocalAccounts={activeId,activeName,activeKey,accounts,show,logout,view,bind,
 // Export explicit user-scoped key for app storage. No fallback to shared legacy key.
 keyFor:id=>DATA_PREFIX+id};
})();