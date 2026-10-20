const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const warnings = [];

class LocalAssets extends ResourceLoader {
  fetch(url) {
    const location = new URL(url);
    const filePath = path.resolve(root, '.'+decodeURIComponent(location.pathname));
    if (!filePath.startsWith(root+path.sep) || !fs.existsSync(filePath)) return Promise.resolve(Buffer.from(''));
    return Promise.resolve(fs.readFileSync(filePath));
  }
}

async function main() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => warnings.push(String(e?.message || e)));
  vc.on('error', e => warnings.push(String(e)));

  const dom = new JSDOM(html, {
    url: 'https://test.local/',
    runScripts: 'dangerously',
    resources: new LocalAssets(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async () => ({ok:false,status:404,json:async()=>({})});
      window.scrollTo = () => {};
      window.confirm = () => true;
    }
  });
  const { window } = dom;
  await Promise.race([
    new Promise(resolve=>window.addEventListener('load',resolve,{once:true})),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timed out loading game assets')),15000))
  ]);
  await new Promise(resolve=>setTimeout(resolve,25));
  const d = window.document;
  const click = selector => {
    const el = d.querySelector(selector);
    assert.ok(el, 'Missing clickable element: '+selector+', page title: '+d.title+', text: '+d.body.textContent.slice(0,200));
    assert.ok(!el.disabled, 'Unexpected disabled element: '+selector);
    el.click();
  };
  assert.ok(window.oshGameAPI, 'Legacy question bank API not initialized');
  assert.ok(window.oshAdventure, 'Shiba adventure script not loaded');
  assert.ok(d.querySelector('.g-hero'), 'Adventure hero not rendered');
  assert.ok(d.body.textContent.includes('職安勇者'),'Missing RPG header');
  console.log('PASS: Shiba adventure home & original quiz API ready');

  click('[data-game="world"]');
  assert.equal(d.querySelectorAll('.g-node').length,6,'Need six adventure areas');
  click('[data-game="zone"][data-z="0"]');
  assert.equal(d.querySelectorAll('.g-stage').length,4,'Need four stages');
  assert.ok(d.querySelector('[data-game="stage"][data-s="1"]').disabled,'Second stage must start locked');
  click('[data-game="stage"][data-z="0"][data-s="0"]');
  assert.ok(d.querySelector('.g-question'),'Battle has not rendered a question');
  console.log('PASS: World map, chapter and first question load');

  const api=window.oshGameAPI;
  let tested=0;
  while (api.saved().adventureBattle) {
    const battle=api.saved().adventureBattle;
    const q=api.allBank().find(x=>x.id===battle.ids[battle.index]);
    assert.ok(q,'Question missing from source bank');
    for (const answer of q.answer) click('[data-game="pick"][data-pick="'+answer+'"]');
    click('[data-game="check"]');
    assert.ok(d.querySelector('.g-feedback.ok'),'Correct answer not recognized');
    click('[data-game="next"]');
    tested++;
    assert.ok(tested<15,'Unexpected loop in game questions');
  }
  assert.ok(d.querySelector('.g-win'),'No victory screen');
  assert.ok(api.saved().adventure.stars['0-0']>=1,'No progress saved on completed stage');
  assert.ok(api.saved().adventure.xp>0,'XP reward missing');
  assert.ok(api.saved().adventure.coins>0,'Coin reward missing');
  console.log('PASS: Solved '+tested+' questions, stage cleared, XP/coin/star saved');

  click('[data-game="zone"][data-z="0"]');
  click('[data-game="stage"][data-z="0"][data-s="1"]');
  assert.ok(d.querySelector('.g-question'),'Unlocked second challenge did not load');
  console.log('PASS: Unlocking next level works');

  api.nav('home');
  click('[data-game="bag"]');
  assert.ok(d.body.textContent.includes('裝備')&&d.querySelector('.g-board'), 'Equipment screen not usable');
  console.log('PASS: Equipment and achievement inventory is accessible');

  api.nav('practice');
  assert.ok(d.body.textContent.includes('題目練習'),'Original practice page missing');
  api.nav('archive');
  assert.ok(d.body.textContent.includes('歷屆試題庫'),'Historical exam links missing');
  api.nav('settings');
  assert.ok(d.body.textContent.includes('管理設定'),'Backup settings missing');
  console.log('PASS: Original practice, exam archives and settings preserved');

  const unexpected=warnings.filter(w=>!/Could not load|Not implemented|Failed to execute/.test(w));
  if(unexpected.length) console.warn('Nonfatal JS DOM warnings:',unexpected.slice(0,3));
  console.log('ALL RPG SMOKE TESTS PASSED');
  dom.window.close();
}
main().catch(e=>{console.error(e.stack);process.exit(1)});
