import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
const errors = [];
page.on('pageerror',err=>errors.push(err.message));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
await page.locator('.g-hero h1').waitFor({timeout:20000});
assert.match(await page.locator('.g-hero').innerText(),/職安勇者/);
assert.ok(await page.locator('img[src^="./shiba-photo.svg"]').first().count()>0);
const photoLoaded=await page.locator('img[src^="./shiba-photo.svg"]').first().evaluate(el=>el.complete&&el.naturalWidth>0);
assert.equal(photoLoaded,true,'Transparent illustrated mascot must load');
await page.locator('[data-game="world"]').first().click();
await page.locator('.g-map').waitFor();
await page.locator('[data-game="zone"][data-z="0"]').click();
await page.locator('.g-stages').waitFor();
await page.locator('[data-game="stage"][data-s="0"]').click();
await page.locator('.g-question').waitFor();
for(let i=0;i<5;i++){
  const answer = await page.evaluate(()=>{
    const api=window.oshGameAPI,b=api.saved().adventureBattle;
    const q=api.allBank().find(q=>q.id===b.ids[b.index]);
    return q.answer;
  });
  for(const index of answer)await page.locator('[data-game="pick"][data-pick="'+index+'"]').click();
  await page.locator('[data-game="check"]').click();
  await page.locator('.g-feedback.ok').waitFor();
  await page.locator('[data-game="next"]').click();
}
await page.locator('.g-win').waitFor();
const state=await page.evaluate(()=>window.oshGameAPI.saved().adventure);
assert.equal(state.stars['0-0'],3,'Passing first stage awards three stars');
assert.ok(state.xp>0 && state.coins>0,'Victory awards XP and coins');
await page.locator('[data-game="zone"][data-z="0"]').click();
assert.equal(await page.locator('[data-game="stage"][data-s="1"]').isEnabled(),true,'Second stage unlocks');
const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));
assert.ok(width.scroll<=width.inner+2,'Mobile page should not overflow horizontally');
assert.deepEqual(errors,[],'Browser runtime errors');
console.log('PASS: Shiba home, image, map, chapter, 5-question battle, detailed feedback, victory, rewards, stage unlock, iPhone layout.');
await browser.close();
