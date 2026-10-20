/* 職安勇者 / 黑柴財財 / 甲級闖關學習系統 v2.0
 * Adventure gameplay is additive. Existing professional question bank, law explanations,
 * official-source tagging, mock exam and localStorage study history remain in index.html.
 */
(function(){
"use strict";
const ZONES=[
 {name:"職安法規王國",short:"安衛法規",icon:"🏰",foe:"📜",boss:"👑",desc:"認識職業安全衛生法、雇主責任與法令遵循",match:/職業安全衛生法|勞動檢查|法規|法令|雇主|罰則|勞工義務|90006|法定/i},
 {name:"危害辨識森林",short:"風險評估",icon:"🌲",foe:"🐍",boss:"🐉",desc:"危害辨識、風險矩陣與暴露控制",match:/風險|危害|辨識|評估|預防|控制|職業災害/i},
 {name:"機械安全工廠",short:"機械安全",icon:"🏭",foe:"🤖",boss:"⚙️",desc:"機械防護、起重設備、電氣與墜落預防",match:/機械|吊掛|起重|電氣|高處|墜落|感電|檢查|堆高機|防護罩/i},
 {name:"職業衛生學院",short:"作業健康",icon:"🏥",foe:"🧪",boss:"🦠",desc:"健康管理、作業環境與危害性因子",match:/職業衛生|健康|作業環境|噪音|化學|粉塵|呼吸|溶劑|生物|危害物/i},
 {name:"緊急應變火山",short:"緊急應變",icon:"🌋",foe:"🔥",boss:"👾",desc:"消防、化學品洩漏及災害應變",match:/消防|火災|洩漏|緊急|應變|救護|滅火|危險物|事故/i},
 {name:"安全管理城堡",short:"系統管理",icon:"🏯",foe:"💼",boss:"👹",desc:"ISO 45001、安全衛生管理、稽核與事故調查",match:/安全衛生管理|稽核|承攬|教育訓練|管理系統|事故調查|改善|PDCA|委員會|危險性工作場所/i}
];
const STAGES=[
 {name:"認識危害",icon:"📖",count:5},{name:"現場挑戰",icon:"🛡️",count:5},
 {name:"知識試煉",icon:"⚔️",count:5},{name:"BOSS 決戰",icon:"👾",count:8,boss:true}
];
const $api=()=>window.oshGameAPI;
const h=v=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
function game(){const s=$api().saved();if(!s.adventure||typeof s.adventure!=="object")s.adventure={xp:0,coins:0,stars:{},zone:0,clears:0,bonuses:{}};const x=s.adventure;x.stars=x.stars||{};x.bonuses=x.bonuses||{};return x}
function level(){return Math.floor(game().xp/180)+1}
function stageKey(z,s){return z+"-"+s}
function stars(z,s){return Math.max(0,Math.min(3,Number(game().stars[stageKey(z,s)]||0)))}
function canZone(z){return z===0||stars(z-1,3)>0}
function canStage(z,s){return canZone(z)&&(s===0||stars(z,s-1)>0)}
function starText(n){return '<span class="g-stars">'+'★'.repeat(n)+'<span class="dim">'+'☆'.repeat(3-n)+'</span></span>'}
function totalStars(){return Object.values(game().stars).reduce((n,v)=>n+Number(v||0),0)}
function mascot(){return '<img class="g-photo" src="./shiba-photo.svg?v=2" alt="黑柴財財安全勇者">'}
function mascotImg(){return '<span aria-label="黑柴財財" class="g-shiba-mark">'+mascot()+'</span>'}
function header(){const g=game(), exp=g.xp%180,pc=Math.round(exp/180*100);return '<div class="g-status"><span class="g-avatar">'+mascot()+'</span><div class="g-status-text"><strong>🐾 財財勇者　Lv.'+level()+'</strong><small>甲級闖關學習系統　'+($api().course()==="22100"?"職業衛生":$api().course()==="22000"?"職業安全":"職安衛")+'</small><div class="g-exp"><i style="width:'+pc+'%"></i></div></div><div class="g-coins">🪙 <b>'+g.coins+'</b><small>金幣</small></div><div class="g-coins">⭐ <b>'+totalStars()+'</b><small>星星</small></div></div>'}
function navTitle(title,back,description){return '<div class="g-title"><button data-game="'+back+'">← 返回</button><span>'+h(title)+'</span><span style="font-size:11px">🐾</span></div>'+(description?'<p class="g-note pale">'+h(description)+'</p>':'')}
function home(){const g=game(),today=$api().today(),records=$api().saved().attempts?.[today]||{total:0},daily=Math.min(10,records.total||0);
return '<main class="game-page">'+header()+
 '<section class="g-hero"><div class="g-cloud"></div><div class="g-logo"><h1>職安勇者</h1><span>甲級闖關學習系統</span></div><div class="g-intro">跟著黑柴財財<br>把考古題變成<br>一場安全冒險！</div><div class="g-mascot">'+mascot()+'</div><div class="g-speech">🐾 答題蒐集星星，打敗危害魔王！</div></section>'+
 '<button class="g-btn full" data-game="world">🐾 開始冒險　➜</button>'+
 '<section class="g-board"><h2>🏆 勇者任務板</h2><div class="g-statgrid"><div><b>'+daily+'/10</b><small>今日答題</small></div><div><b>'+totalStars()+'/72</b><small>冒險星星</small></div><div><b>'+g.clears+'</b><small>成功闖關</small></div></div><p>🎁 每日任務：完成 10 題，即完成今日學習目標！</p><div class="g-progress"><span style="width:'+Math.min(100,daily*10)+'%"></span></div></section>'+
 '<section class="g-board"><h2>🎒 選擇勇者證照</h2>'+$api().selector()+'<p>題目沿用現有題庫，官方參考題與原創練習題會明確標示。</p></section>'+
 '<section class="g-board"><h2>🗺️ 冒險與備考</h2><div class="g-quickgrid">'+
 '<button data-game="world">🗺️ 世界地圖<small>六大主題・24 個關卡</small></button>'+
 '<button data-game="daily">⚔️ 每日勇者挑戰<small>闖關、獲得星星與金幣</small></button>'+
 '<button data-start="mock">📝 正式模擬考<small>80 題・100 分鐘（原模式）</small></button>'+
 '<button data-page="practice">📚 題庫修練場<small>題目詳解・錯題複習</small></button>'+
 '<button data-page="subjective">✍️ 甲級術科修練<small>申論與計算題</small></button>'+
 '<button data-page="settings">⚙️ 設定與備份<small>題庫更新、練習紀錄備份</small></button>'+
 '</div></section><div class="g-mini g-note">考古題連結依原網站的歷屆索引更新。遊戲星數、金幣與勇者等級只代表學習進度，不是官方檢定成績。</div></main>'}
function map(){const g=game();const positions=[[30,12],[73,27],[30,41],[74,55],[28,70],[71,86]];
let route='<svg class="route" viewBox="0 0 330 730" preserveAspectRatio="none"><path d="M99 88 Q300 135 238 200 Q32 267 99 300 Q294 367 244 402 Q42 478 92 510 Q290 575 235 620" fill="none" stroke="#654b29" stroke-width="12" stroke-dasharray="10 14" opacity=".45"/><path d="M99 88 Q300 135 238 200 Q32 267 99 300 Q294 367 244 402 Q42 478 92 510 Q290 575 235 620" fill="none" stroke="#fff2b5" stroke-width="5" stroke-dasharray="8 16" opacity=".8"/></svg>';
return '<main class="game-page">'+header()+navTitle('🌍 世界地圖','home','完成上一章的 BOSS 關，就能解鎖下一座冒險地區。')+
 '<div class="g-map">'+route+ZONES.map((z,i)=>{const unlocked=canZone(i),done=stars(i,3)>0,prog=[0,1,2,3].filter(s=>stars(i,s)).length;return '<button class="g-node '+(!unlocked?'locked':done?'complete':'')+'" style="left:'+positions[i][0]+'%;top:'+positions[i][1]+'%" data-game="zone" data-z="'+i+'" '+(!unlocked?'disabled':'')+'><span class="g-pin">'+(unlocked?z.icon:"🔒")+'</span><strong>'+(i+1)+'. '+z.short+'</strong><small>'+prog+'/4 '+(done?'🏆':'關')+'</small></button>'}).join('')+'</div>'+
 '<section class="g-board"><h2>🐾 冒險規則</h2><p>每關答對至少 60% 且保有生命即可過關。錯答扣 1 顆愛心；通過關卡取得 1～3 顆星星。每章通過 BOSS 才解鎖下一章。</p></section></main>'}
function chapter(){const g=game(),z=Math.min(5,Math.max(0,Number(g.zone)||0)),zone=ZONES[z],ct=[0,1,2,3].filter(s=>stars(z,s)>0).length;
return '<main class="game-page">'+header()+navTitle('第 '+(z+1)+' 章　'+zone.short,'world')+
 '<div class="g-board" style="text-align:center;background:linear-gradient(#d2edf0,#eee1b2)"><div style="font-size:76px">'+zone.icon+'</div><h2>'+h(zone.name)+'</h2><p>'+h(zone.desc)+'</p><div class="g-progress"><span style="width:'+ct*25+'%"></span></div><small>已完成 '+ct+'/4 關</small></div>'+
 '<div class="g-stages">'+STAGES.map((s,i)=>{const open=canStage(z,i),st=stars(z,i);return '<button class="g-stage '+(open?'':'locked')+'" '+(open?'data-game="stage" data-z="'+z+'" data-s="'+i+'"':'disabled')+'><span class="g-stage-icon">'+(open?s.icon:'🔒')+'</span><span><strong>'+(z+1)+'-'+(i+1)+'　'+s.name+'</strong><small>'+s.count+' 題・'+(s.boss?'魔王決戰':'基礎挑戰')+'</small>'+starText(st)+'</span><span class="g-go">'+(open?(st?'再挑戰':'挑戰'):'未解鎖')+'</span></button>'}).join('')+'</div>'+
 '<p class="g-note" style="text-align:center">先完成前一關才能解鎖下一關；答錯後仍可查看解析。</p></main>'}
function getBattle(){const b=$api().saved().adventureBattle;return b && b.course===$api().course()?b:null}
function chooseQuestions(z,stage){const pool=$api().allBank(),wanted=STAGES[stage].count,zone=ZONES[z];const matched=pool.filter(q=>zone.match.test((q.topic||"")+" "+(q.text||"")));const unique=new Map();
const add=arr=>{for(const q of arr){if(!unique.has(q.id))unique.set(q.id,q);if(unique.size>=wanted)break}};
function shuffled(arr){const out=[...arr];for(let i=out.length-1;i>0;i--){let k=Math.floor(Math.random()*(i+1));[out[i],out[k]]=[out[k],out[i]]}return out}
add(shuffled(matched.filter(q=>q.source_type==="official")));add(shuffled(matched.filter(q=>q.source_type!=="official")));add(shuffled(pool.filter(q=>q.source_type==="official")));add(shuffled(pool));return [...unique.values()].slice(0,wanted)}
function startStage(z,s){if(!canStage(z,s)){$api().toast("請先完成前一關！");return}
const qs=chooseQuestions(z,s);if(qs.length<3){$api().toast("目前題庫不足，請連線同步或切換證照。");return}
game().zone=z;const b={course:$api().course(),zone:z,stage:s,ids:qs.map(q=>q.id),index:0,hp:3,correct:0,picked:[],checked:false,lastCorrect:false,done:false,started:Date.now()};$api().saved().adventureBattle=b;$api().persist();$api().nav("battle")}
function findQuestion(id){return $api().allBank().find(q=>q.id===id)}
function battle(){const b=getBattle();if(!b)return '<main class="game-page">'+header()+'<section class="g-board">冒險尚未開始。<button class="g-btn full" data-game="world">返回地圖</button></section></main>';
const q=findQuestion(b.ids[b.index]);if(!q)return '<main class="game-page">'+header()+'<div class="g-board">這題暫時無法讀取，請重新挑戰。<button class="g-btn full" data-game="resetbattle">重新挑戰</button></div></main>';
const st=STAGES[b.stage],zone=ZONES[b.zone],final=b.index===b.ids.length-1||b.hp<=0,letters=["A","B","C","D","E","F"];
const choices=q.options.map((x,i)=>{const sel=b.picked.includes(i),correct=q.answer.includes(i);let klass=b.checked?(correct?"correct":sel?"wrong":""):sel?"active":"";return '<button class="g-choice '+klass+'" data-game="pick" data-pick="'+i+'" '+(b.checked?'disabled':'')+'><b>'+(q.type==="multi"?(sel?'☑':'□'):letters[i])+'</b><span>'+h(x)+'</span>'+(b.checked&&correct?' ✅':'')+'</button>'}).join('');
return '<main class="game-page">'+navTitle((b.zone+1)+'-'+(b.stage+1)+'　'+st.name,'quit')+
 '<div class="g-battle-head"><span>🐾 財財　<span class="g-hp">'+('❤️'.repeat(b.hp)+'🤍'.repeat(3-b.hp))+'</span></span><span>第 '+(b.index+1)+' / '+b.ids.length+' 題</span></div><div class="g-progress"><span style="width:'+(b.index/b.ids.length*100)+'%"></span></div>'+
 '<div class="g-battle-scene"><span class="g-hero-fighter">🐕‍🦺</span><span class="g-boss-fighter '+(st.boss?'boss':'')+'">'+(st.boss?zone.boss:zone.foe)+'</span></div>'+
 '<div class="g-question"><div class="g-row"><span class="g-capsule">'+(q.source_type==="official"?"官方公告題庫（第三方整理）":"原創／自訂練習題")+'</span><span class="g-tiny">'+(q.type==="multi"?"複選題":"單選題")+'</span></div>'+
 '<h2>'+h(q.text)+'</h2>'+choices+
 (b.checked?'<div class="g-feedback '+(b.lastCorrect?'ok':'bad')+'"><strong>'+(b.lastCorrect?'✅ 攻擊成功！答對了！':'💔 遭受攻擊！繼續學習！')+'</strong><div>正確答案：'+q.answer.map(i=>letters[i]).join('、')+'</div><div>'+h(q.explanation||"請搭配法規原文核對本題。")+'</div>'+((q.source_url&&/^https:\/\//i.test(q.source_url))?'<a href="'+h(q.source_url)+'" target="_blank" rel="noopener noreferrer">查看題目來源／官方題庫 ↗</a>':'')+'</div>'+
 '<button class="g-btn full" data-game="next">'+(final?'🏆 查看闖關結果':'🐾 下一題 ➜')+'</button>':
 '<button class="g-btn full" data-game="check" '+(!b.picked.length?'disabled':'')+'>⚔️ 確認攻擊</button>')+'</div>'+
 '<p class="g-note" style="text-align:center">魔王 HP 由題目進度代表；完整選出複選題全部答案才算答對。</p></main>'}
function pick(n){const b=getBattle();if(!b||b.checked)return;const q=findQuestion(b.ids[b.index]);if(!q)return;if(q.type==="multi")b.picked=b.picked.includes(n)?b.picked.filter(x=>x!==n):[...b.picked,n].sort();else b.picked=[n];$api().persist();$api().refresh()}
function check(){const b=getBattle();if(!b||b.checked||!b.picked.length)return;const q=findQuestion(b.ids[b.index]);if(!q)return;const ok=q.answer.length===b.picked.length&&q.answer.every(n=>b.picked.includes(n));b.lastCorrect=ok;b.checked=true;b.correct+=ok?1:0;b.hp=Math.max(0,b.hp-(ok?0:1));$api().recordAnswer(q,b.picked,ok);$api().persist();$api().refresh()}
function next(){const b=getBattle();if(!b||!b.checked)return;if(b.hp<=0||b.index>=b.ids.length-1){end();return}b.index++;b.picked=[];b.checked=false;$api().persist();$api().refresh()}
function end(){const b=getBattle();if(!b)return;const ratio=b.correct/b.ids.length;const pass=ratio>=0.6&&b.hp>0&&b.index===b.ids.length-1;const earned=pass?(ratio>=.999?3:ratio>=.8?2:1):0;
const s=$api().saved(),g=game(),old=stars(b.zone,b.stage);let gold=0,xp=0;
if(pass&&earned>old){gold=25+(earned-old)*15;xp=40+(earned-old)*35;g.stars[stageKey(b.zone,b.stage)]=earned;g.xp+=xp;g.coins+=gold;if(old===0)g.clears++}
s.adventureResult={course:b.course,z:b.zone,stage:b.stage,score:b.correct,total:b.ids.length,pass,earned,gold,xp,hp:b.hp};s.adventureBattle=null;$api().persist();$api().nav("victory")}
function victory(){const r=$api().saved().adventureResult;if(!r)return '<main class="game-page">'+header()+'<button class="g-btn full" data-game="world">世界地圖</button></main>';return '<main class="game-page">'+header()+
 '<div class="g-win"><div class="big-shiba">'+(r.pass?'🐕':'🐾')+'</div><h2>'+(r.pass?'關關成功！':'這次還沒過關')+'</h2><p style="font-weight:900;color:#5b381b">'+(r.z+1)+'-'+(r.stage+1)+'　'+STAGES[r.stage].name+'</p>'+
 '<div style="font-size:33px;color:#fff6c8;text-shadow:1px 2px #794e27">'+(r.pass?'⭐'.repeat(r.earned):'☆ ☆ ☆')+'</div><p>答對 '+r.score+' / '+r.total+' 題　'+Math.round(r.score/r.total*100)+'%</p>'+
 '<div class="g-reward"><div><span>✨</span>經驗值 +'+r.xp+'</div><div><span>🪙</span>金幣 +'+r.gold+'</div><div><span>❤️</span>剩餘 '+r.hp+'</div></div>'+
 '<p class="g-note">'+(r.pass?'完成學習試煉！通過 BOSS 後即可開啟下一章。':'勇者先複習錯題，再挑戰一次就能更熟悉危害與法規。')+'</p>'+
 '<button class="g-btn full" data-game="stage" data-z="'+r.z+'" data-s="'+r.stage+'">♻️ 再挑戰本關</button>'+
 '<button class="g-btn blue full" data-game="zone" data-z="'+r.z+'">📜 返回章節</button>'+
 '<button class="g-btn dark full" data-game="world">🗺️ 世界地圖</button></div></main>'}
function dispatch(el){const type=el.dataset.game;const z=Number(el.dataset.z),s=Number(el.dataset.s);
switch(type){
 case "home":$api().nav("home");break;case "world":$api().nav("adventure");break;
 case "zone":if(!canZone(z))return;$api().saved().adventure.zone=z;$api().persist();$api().nav("chapter");break;
 case "stage":startStage(z,s);break;
 case "daily":{const g=game();let zi=ZONES.findIndex((_,i)=>canZone(i)&&stars(i,3)===0);if(zi<0)zi=5;let si=STAGES.findIndex((_,i)=>canStage(zi,i)&&stars(zi,i)===0);if(si<0)si=0;startStage(zi,si);break}
 case "pick":pick(Number(el.dataset.pick));break;case "check":check();break;case "next":next();break;
 case "resetbattle":{const b=getBattle();if(b)startStage(b.zone,b.stage);else $api().nav("adventure");break}
 case "quit":if(confirm("離開本次挑戰？當前關卡進度會保留，下次可繼續。"))$api().nav("chapter");break;
 case "resume":$api().nav("battle");break;
}}
document.addEventListener("click",event=>{const el=event.target.closest("[data-game]");if(!el||el.disabled)return;event.preventDefault();dispatch(el)});
window.oshAdventure={home,map,chapter,battle,victory};
if(window.oshGameAPI)window.oshGameAPI.refresh();
})();