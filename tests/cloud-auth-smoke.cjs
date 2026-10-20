const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const uid='11111111-2222-4333-8444-555555555555';
const progress=new Map();
const users=new Map([['learner@example.com',{id:uid,email:'learner@example.com'}]]);
class Files extends ResourceLoader{
 fetch(url){
  const u=new URL(url);
  if(u.pathname.endsWith('/cloud/cloud-config.js'))
   return Promise.resolve(Buffer.from('window.OSH_CLOUD_CONFIG={url:"https://testproj.supabase.co",publishableKey:"sb_publishable_testing",redirectUrl:"https://test.local/"};'));
  if(u.origin!=='https://test.local')return Promise.resolve(Buffer.from(''));
  const fn=path.resolve(root,'.'+u.pathname);
  if(!fn.startsWith(root+path.sep)||!fs.existsSync(fn))return Promise.resolve(Buffer.from(''));
  return Promise.resolve(fs.readFileSync(fn));
 }
}
function supabase(){
 const mk=()=>({
  from(table){
   const q={table,where:{},op:'select',payload:null};
   const self={
    select(){return self},
    insert(value){q.op='insert';q.payload=value;return self},
    update(value){q.op='update';q.payload=value;return self},
    eq(key,value){q.where[key]=value;return self},
    async single(){return execute(true)},
    async maybeSingle(){return execute(false)}
   };
   function execute(required){
    if(table==='learner_profiles'){
     const result={user_id:uid,display_name:'測試學員',role:'student'};
     return {data:result,error:null};
    }
    let value=progress.get(q.where.user_id||q.payload?.user_id);
    if(q.op==='select'){
     return {data:value||null,error:required&&!value?{message:'not found'}:null};
    }
    if(q.op==='insert'){
     if(value)return {data:null,error:{code:'23505',message:'duplicate key'}};
     value={user_id:q.payload.user_id,data:q.payload.data,stats:q.payload.stats,version:0,updated_at:new Date().toISOString()};
     progress.set(value.user_id,value);return {data:{version:0},error:null};
    }
    if(q.op==='update'){
     if(!value||value.version!==q.where.version)return {data:null,error:null};
     value={...value,data:q.payload.data,stats:q.payload.stats,version:value.version+1,updated_at:new Date().toISOString()};
     progress.set(value.user_id,value);return {data:{version:value.version},error:null};
    }
    return {data:null,error:{message:'unexpected operation'}};
   }
   return self;
  },
  auth:{
   async getSession(){return {data:{session:null},error:null}},
   async getUser(){return {data:{user:users.get('learner@example.com')},error:null}},
   async signInWithPassword({email}){return {data:{user:users.get(email)},error:null}},
   async signOut(){return {error:null}},
   onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
  }
 });
 return {createClient:mk};
}
async function open(){
 const errors=[];
 const vc=new VirtualConsole();
 vc.on('jsdomError',x=>errors.push(String(x.message||x)));
 const dom=new JSDOM(html,{
  url:'https://test.local/',
  runScripts:'dangerously',resources:new Files(),pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(window){
   window.supabase=supabase();
   window.scrollTo=()=>{};
   window.confirm=()=>true;
   window.fetch=async()=>({ok:false,status:404,json:async()=>({})});
  }
 });
 const w=dom.window;
 await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
 for(let n=0;n<100&&!w.document.querySelector('#cloud-auth-form');n++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(w.document.querySelector('#cloud-auth-form'),'Cloud login screen must render');
 assert.equal(w.document.querySelector('#osh-signup'),null,'Local PIN login should be disabled in cloud mode');
 return {w,dom,errors};
}
async function login(w){
 const d=w.document;
 d.querySelector('#cloud-email').value='learner@example.com';
 d.querySelector('#cloud-pass').value='mypassword123';
 d.querySelector('#cloud-auth-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let n=0;n<100&&!d.querySelector('.g-hero');n++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(d.querySelector('.g-hero'),'Cloud sign-in should unlock game');
}
(async()=>{
 const a=await open();await login(a.w);
 assert.equal(a.w.oshCloud.activeId(),uid);
 a.w.oshGameAPI.recordAnswer({id:'test01',topic:'消防',source_type:'practice'},[1],true);
 a.w.oshGameAPI.persist();
 for(let n=0;n<100&&!progress.get(uid)?.data?.answers?.length;n++)await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(progress.get(uid).data.answers.length,1,'First device must upload answer');
 assert.equal(progress.get(uid).stats.correct,1);
 await a.w.oshCloud.logout();
 assert.equal(a.w.oshCloud.activeId(),null,'Logout removes account access');
 const b=await open();await login(b.w);
 assert.equal(b.w.oshGameAPI.saved().answers.length,1,'Second device reads previous answer from cloud');
 assert.deepEqual(a.errors,[],'First device browser JS errors');
 assert.deepEqual(b.errors,[],'Second device browser JS errors');
 console.log('PASS: cloud login, offline save, upload, logout and second-device restore');
 a.w.close();b.w.close();
})().catch(e=>{console.error(e);process.exitCode=1});
