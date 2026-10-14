// 可选真实浏览器检查：只使用 Node.js 内置模块与本机 Chrome / Edge。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const server=require('node:http').createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  if(file==='favicon.ico'){res.writeHead(204);res.end();return;}
  if(!/^(?:[a-z0-9_-]+\.(?:html|js|css)|assets\/(?:[a-z0-9-]+\.png|licenses\/[a-z0-9-]+\.txt))$/.test(file)){res.writeHead(404);res.end();return;}
  const absolute=path.resolve(__dirname,'..',file);if(!fs.existsSync(absolute)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(absolute));
});

const executable = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => fs.existsSync(p));
if (!executable) throw new Error('找不到浏览器，请通过 BROWSER_PATH 指定 Chrome 或 Edge 可执行文件。');
const output = path.resolve(__dirname, '../test-output');
fs.mkdirSync(output, { recursive: true });
const browser = spawn(executable, ['--headless=new', '--remote-debugging-pipe',
  `--user-data-dir=${path.join(output, 'browser-profile')}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-features=AutoDeElevate',
  '--no-sandbox', '--no-startup-window'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

async function run() {
  let sequence = 0;
  let sessionId;
  const pending = new Map();
  const errors = [];
  const receive = message => {
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
    if (!message.id) return;
    const callback = pending.get(message.id);
    if (callback) {
      clearTimeout(callback.timeout); pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    }
  };
  let buffer = '';
  browser.stdio[4].setEncoding('utf8');
  browser.stdio[4].on('data', data => {
    buffer += data;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const packet = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (packet) receive(JSON.parse(packet));
    }
  });
  const failPending = error => {
    for (const callback of pending.values()) { clearTimeout(callback.timeout); callback.reject(error); }
    pending.clear();
  };
  browser.on('error', failPending);
  browser.on('exit', code => failPending(new Error(`浏览器已退出：${code}`)));
  browser.stdio[3].on('error', failPending);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP 超时：${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 1420, deviceScaleFactor: 1, mobile: false });
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.testClock = { next: 0, jobs: new Map(),
      tick() { const entry = this.jobs.entries().next().value; if (!entry) return false;
        this.jobs.delete(entry[0]); entry[1].fn(); return true; } };
    window.setTimeout = (fn, delay) => { const id = ++testClock.next; testClock.jobs.set(id, { fn, delay }); return id; };
    window.clearTimeout = id => testClock.jobs.delete(id);
  ` });
  if(!process.env.BROWSER_URL&&process.env.BROWSER_FILE!=='1')await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const fileUrl = process.env.BROWSER_URL || (server.listening ? 'http://127.0.0.1:'+server.address().port+'/' : pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  const waitReady = async () => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`document.getElementById('create-dialog')?.open === true`)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('创建界面未正常加载');
  };
  const click = id => evaluate(`document.getElementById('${id}').click()`);
  const tick = () => evaluate('testClock.tick()');
  const speed = value => evaluate(`document.getElementById('speed').value = '${value}'; document.getElementById('speed').dispatchEvent(new Event('change'))`);
  const clock = () => evaluate(`document.getElementById('clock').textContent`);
  const jobs = () => evaluate('testClock.jobs.size');
  const model = () => evaluate(`document.getElementById('save').click(); JSON.parse(localStorage.getItem('ai-dungeon-simulator:v0.3'))`);
  const create = async (classId = 'warrior', seed = 'world-browser-003') => {
    await evaluate(`document.getElementById('class-input').value = '${classId}'; document.getElementById('class-input').dispatchEvent(new Event('change')); document.getElementById('name-input').value = '边境观察者'; document.getElementById('seed-input').value = '${seed}'; document.getElementById('create-form').requestSubmit()`);
  };
  const loadSnapshot = async snapshot => {
    await evaluate(`localStorage.setItem('ai-dungeon-simulator:v0.3', ${JSON.stringify(JSON.stringify(snapshot))})`);
    await click('load');
  };
  const screenshot = async (filename, selector) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const clip = selector ? await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`) : undefined;
    const result = await send('Page.captureScreenshot', { format: 'png', ...(clip ? {clip,captureBeyondViewport:true} : {}) });
    const bytes = Buffer.from(result.data, 'base64');
    fs.writeFileSync(path.join(output, filename), bytes);
    const comparisons = { 'world-v03.png':'world', 'dungeon-v03.png':'dungeon', 'character.png':'character', 'narrow-v04.png':'mobile', 'dungeon-expanded.png':'dungeon-expanded' };
    if (process.env.COMPARE_VERSION && comparisons[filename]) {
      if (!/^v0[67]$/.test(process.env.COMPARE_VERSION)) throw new Error('Invalid comparison version');
      const target = path.resolve(__dirname,'../docs/visual-comparison');fs.mkdirSync(target,{recursive:true});
      fs.writeFileSync(path.join(target,process.env.COMPARE_VERSION+'-'+comparisons[filename]+'.png'),bytes);
    }
  };
  await send('Page.navigate', { url: fileUrl }); await waitReady();
  if(await evaluate('typeof PixelAssets!=="undefined"')) assert.equal(await evaluate('PixelAssets.ready'), 'ready', 'All real atlases must load');
  if(await evaluate('typeof PixelAssets!=="undefined"')) {
    const check=await evaluate(`(()=>{const sim=new Adventure.Simulation({seed:'visual-purity'});sim.enterDungeon();const before=JSON.stringify(sim.toSave());const canvas=document.createElement('canvas'),v=new MapView(canvas);v.draw(sim,false);let unknown=0;const ratio=devicePixelRatio;for(let y=v.camera.y;y<v.camera.y+13;y++)for(let x=v.camera.x;x<v.camera.x+13;x++)if(sim.dungeon.explorer.known[y][x]===-1){if(location.protocol!=='file:'){const pixels=canvas.getContext('2d').getImageData((x-v.camera.x)*32*ratio,(y-v.camera.y)*32*ratio,32*ratio,32*ratio).data;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==8||pixels[i+1]!==12||pixels[i+2]!==19||pixels[i+3]!==255)throw Error('Fog leak');}unknown++;}for(let i=0;i<30;i++)v.draw(sim,false);return {pure:before===JSON.stringify(sim.toSave()),unknown,smoothing:canvas.getContext('2d').imageSmoothingEnabled,loaded:PixelAssets.files.every(k=>PixelAssets.images[k].naturalWidth>0)};})()`);
    assert.equal(check.pure,true);assert.ok(check.unknown>0);assert.equal(check.smoothing,false);assert.equal(check.loaded,true);
  }
  await screenshot('creation-v03.png');
  await create();
  assert.equal(await evaluate(`document.querySelectorAll('#ability-scores strong').length`), 6);
  assert.equal(await evaluate(`document.querySelector('#ability-scores strong').textContent`), '16');
  await click('card-collapse'); assert.equal(await evaluate(`document.getElementById('card-collapse').getAttribute('aria-expanded')`), 'false');
  await click('card-collapse');
  await screenshot('character.png', '.character-panel');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Narrow layout must not overflow');
  await screenshot('narrow-v04.png');
  if(await evaluate('typeof PixelAssets!=="undefined"')) {
    for(const width of [360,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true});
      await evaluate("document.querySelector('[data-mobile-view=map]').click()");
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      assert.ok(await evaluate("document.querySelector('.map-panel').getBoundingClientRect().width>300"));
      await evaluate("document.querySelector('[data-mobile-view=character]').click()");
      assert.ok(await evaluate("getComputedStyle(document.querySelector('.sidebar')).display!=='none'"));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      await evaluate("document.querySelector('[data-mobile-view=story]').click()");
      assert.equal(await evaluate("document.getElementById('chronicle').open"),true);
      await evaluate("document.querySelector('[data-mobile-view=map]').click();document.getElementById('toolbar-more').open=true");
      await click('toggle');assert.equal(await jobs(),0);await click('toggle');assert.equal(await jobs(),1);
      assert.ok(await evaluate("document.querySelector('.mobile-nav button').getBoundingClientRect().height>=44"));
      const dpr=await evaluate(`(()=>{const s=new Adventure.Simulation();const c=document.createElement('canvas');new MapView(c).draw(s,false);return {w:c.width,smoothing:c.getContext('2d').imageSmoothingEnabled}})()`);
      assert.equal(dpr.w,1344);assert.equal(dpr.smoothing,false);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await evaluate("document.getElementById('toolbar-more').open=false");
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 1420, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate(`document.getElementById('create-dialog').open`), false);
  assert.equal(await jobs(), 1);
  assert.equal(await evaluate('Array.from(testClock.jobs.values())[0].delay'), 250);
  assert.equal((await model()).phase, 'world');
  await tick(); await click('toggle');
  const pausedClock = await clock();
  assert.equal(await jobs(), 0); assert.equal(await tick(), false); assert.equal(await clock(), pausedClock);
  await speed('slow'); assert.equal(await jobs(), 0);
  await click('toggle'); assert.equal(await evaluate('Array.from(testClock.jobs.values())[0].delay'), 700);
  await speed('fast'); assert.equal(await jobs(), 1); assert.equal(await evaluate('Array.from(testClock.jobs.values())[0].delay'), 60);
  await evaluate('for (let i = 0; i < 18; i++) testClock.tick()');
  let state = await model();
  assert.equal(state.character.position.region, 'forest'); assert.ok(state.character.moves > 0);
  assert.ok(state.character.knowledge.includes('ruins'));
  await screenshot('world-v03.png');
  await click('toggle'); const savedWorld = await model();
  await click('toggle'); await evaluate('for (let i = 0; i < 50; i++) testClock.tick()');
  await loadSnapshot(savedWorld);
  assert.equal(await jobs(), 0); assert.deepEqual(await model(), savedWorld, '本地读取应恢复角色、时间、历史和随机源');
  await click('toggle');
  for (let batch=0; batch<30; batch++) {
    const found=await evaluate(`(()=>{for(let i=0;i<50;i++){if(document.getElementById('event-heading').textContent==='自动战斗'&&document.getElementById('combat-info').textContent.includes('骷髅'))return true;testClock.tick();}return false})()`);
    if(found)break;
  }
  state = await model();
  assert.equal(state.phase, 'dungeon'); assert.ok(state.dungeon.encounters.battle);
  assert.ok(await evaluate(`document.getElementById('map-title').textContent.includes('局部地牢')`));
  assert.ok(state.dungeon.explorer.known.flat().includes(-1), '保留地牢迷雾');
  const battleMoves = state.character.moves;
  await screenshot('dungeon-v03.png');
  if(await evaluate('typeof PixelAssets!=="undefined"')) console.log('v0.7 浏览器视觉检查通过：图集、绘图纯度、360/390px 触控、Retina、暂停；'+(fileUrl.startsWith('file:')?'file:// 已加载，像素读取由 HTTP 运行专项验证。':'HTTP 逐像素迷雾遮罩通过。'));
  await click('toggle'); const battleSave = await model();
  const expanded=await evaluate(`(()=>{const s=Adventure.Simulation.fromSave(JSON.parse(localStorage.getItem('ai-dungeon-simulator:v0.3')));for(let i=0;i<3000;i++){if(s.phase==='dungeon'&&s.dungeon.explorer.visited.size>=40)return s.toSave();s.step();}throw Error('Cannot reach actual expanded dungeon');})()`);
  await loadSnapshot(expanded);await screenshot('dungeon-expanded.png');await loadSnapshot(battleSave);
  assert.equal(await jobs(), 0); await speed('slow'); await tick(); assert.deepEqual(await model(), battleSave);
  await click('toggle'); assert.equal(await evaluate('Array.from(testClock.jobs.values())[0].delay'), 700);
  await speed('fast'); assert.equal(await jobs(), 1); await tick();
  assert.equal((await model()).character.moves, battleMoves, '战斗行动不增加移动步数');
  await loadSnapshot(battleSave); assert.deepEqual(await model(), battleSave);
  await click('toggle');
  // 保持浏览器页面实际渲染，执行一千五百次逻辑行动验证持续运行与区域返回。
  for(let batch=0;batch<30;batch++)await evaluate('for(let i=0;i<50&&testClock.jobs.size;i++)testClock.tick()');
  state = await model();
  assert.equal(state.status, 'alive'); assert.ok(state.world.ruinsCleared);
  assert.ok(state.character.kills >= 3);
  assert.equal(state.phase, 'world'); assert.equal(await jobs(), 1);
  assert.ok(state.world.eventDone.merchant_return);
  assert.ok(await evaluate(`document.getElementById('log').children.length <= 16`));
  assert.ok(await evaluate(`document.getElementById('story').children.length <= 18`));
  await screenshot('return-v03.png');
  await click('details'); assert.equal(await evaluate(`document.getElementById('details-dialog').open`), true);
  assert.ok(await evaluate(`document.getElementById('character-details').textContent.includes('记忆')`));
  await evaluate(`document.getElementById('details-dialog').close()`);
  await click('history'); assert.equal(await evaluate(`document.getElementById('history-dialog').open`), true);
  assert.equal(await evaluate(`document.getElementById('history-list').children.length`), 40);
  await click('history-more'); assert.equal(await evaluate(`document.getElementById('history-list').children.length`), 80);
  await evaluate(`document.getElementById('history-dialog').close()`);
  await click('regenerate'); state = await model();
  // 重置后尚未开始，保存按钮不覆盖已有存档；通过界面检查重置值。
  assert.equal(await jobs(), 0); assert.equal(await clock(), '第 1 天 08:00');
  assert.equal(await evaluate(`document.getElementById('hp').textContent`), '30 / 30');
  assert.equal(await evaluate(`document.getElementById('kills').textContent`), '0');
  assert.equal(await evaluate(`document.getElementById('actions').textContent`), '逻辑行动 0 次');
  assert.ok(await evaluate(`document.getElementById('position').textContent.includes('边境小镇')`));
  await loadSnapshot(battleSave);
  // 合法受伤战斗夹具：确定性覆盖 HP 归零和停止，而非等待偶然死亡。
  const deathFixture = JSON.parse(JSON.stringify(battleSave));
  deathFixture.character.hp = 1; deathFixture.character.potions = 0;
  if(deathFixture.character.rpg){deathFixture.character.rpg.grace=0;deathFixture.character.rpg.battle.guard=0;deathFixture.character.rpg.battle.counter=0;}
  deathFixture.dungeon.encounters.battle.turn = 'skeleton';
  for (let seed = 0; seed < 10000; seed++) {
    if (((Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296 > .95) { deathFixture.randomState = seed; break; }
  }
  await loadSnapshot(deathFixture); await click('toggle'); await tick();
  state = await model();
  assert.equal(state.status, 'dead'); assert.equal(state.character.hp, 0); assert.equal(await jobs(), 0);
  assert.equal(await evaluate(`document.getElementById('toggle').disabled`), true);
  const deadClock = await clock(); await speed('slow'); await click('toggle'); await tick(); assert.equal(await clock(), deadClock);
  await screenshot('death-v03.png');
  await click('new-adventure'); await create('rogue', 'rogue-browser');
  assert.equal((await model()).character.maxHp, 26); assert.equal((await model()).character.damageSides, 6); assert.equal(await jobs(), 1);
  await click('new-adventure'); await create('mage', 'mage-browser');
  assert.equal((await model()).character.maxHp, 22); assert.equal((await model()).character.ac, 12); assert.equal(await jobs(), 1);
  await click('toggle'); const mageSave = await model();
  const badSave = { ...mageSave, version: 999 }; await loadSnapshot(badSave);
  assert.ok(await evaluate(`document.getElementById('notice').textContent.includes('无法读取')`));
  await click('save'); assert.deepEqual(await model(), mageSave, '错误存档不能破坏当前冒险');
  await loadSnapshot(savedWorld);
  await send('Page.reload'); await waitReady();
  await evaluate(`document.getElementById('create-dialog').close()`); await click('load');
  assert.deepEqual(await model(), savedWorld, '刷新后 localStorage 仍可恢复');
  // 新模型只编辑新角色，不允许失败导入改变运行中的资源或计时器。
  if (await evaluate('typeof CharacterCard !== "undefined"')) {
    await click('new-adventure'); const beforeImport = await model();
    const nameBefore = await evaluate("document.getElementById('name-input').value");
    await evaluate("document.querySelector('.card-editor').open=true; document.getElementById('card-json').value='{bad}'; document.getElementById('import-card').click()");
    assert.ok(await evaluate("document.getElementById('card-notice').textContent.includes('JSON 语法错误')"));
    assert.equal(await evaluate("document.getElementById('name-input').value"), nameBefore);
    assert.deepEqual(await model(), beforeImport); assert.equal(await jobs(), 0);
    await evaluate(`const card=CharacterCard.fromConfig({name:'卡片旅人',classId:'mage'});card.identity='边境研究者';card.background='<img src=x onerror="window.pwned=true">';card.level=7;card.abilities.INT=20;card.values=['知识'];card.behavior.riskTolerance=20;card.weaknesses=['畏惧亡灵'];card.importantMemories=['故乡的旧石塔'];document.getElementById('card-json').value=JSON.stringify(card);document.getElementById('import-card').click()`);
    assert.equal(await evaluate("document.getElementById('card-INT').value"), '20');
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await evaluate("document.getElementById('identity-input').scrollIntoView()");
    await screenshot('card-editor-v06.png');
    await send('Emulation.setDeviceMetricsOverride', {width:1240,height:1420,deviceScaleFactor:1,mobile:false});
    await screenshot('card-editor-desktop-v06.png');
    await evaluate("document.getElementById('create-form').requestSubmit()");
    const cardState = await model(); assert.equal(cardState.character.name,'卡片旅人');
    assert.equal(cardState.character.level,7); assert.equal(cardState.character.abilities.INT,20);
    assert.equal(cardState.character.maxHp,22); assert.equal(await jobs(),1);
    await click('details'); assert.equal(await evaluate('window.pwned'),undefined);
    assert.ok(await evaluate("document.getElementById('character-details').textContent.includes('<img')"));
    const downloadPath = path.join(output,'card-download'); fs.mkdirSync(downloadPath,{recursive:true});
    const exportedPath=path.join(downloadPath,'ai-dungeon-character.json'); if(fs.existsSync(exportedPath))fs.unlinkSync(exportedPath);
    await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath}); await click('export-character');
    for(let i=0;i<50&&!fs.existsSync(exportedPath);i++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(fs.existsSync(exportedPath),'实际 JSON 下载应完成');
    const exported=require('../character-card.js').parse(fs.readFileSync(exportedPath,'utf8'));
    assert.equal(exported.name,'卡片旅人'); assert.equal(exported.gold,undefined);
    await click('edit-character'); assert.equal(await jobs(),0);
    assert.equal(await evaluate("document.getElementById('name-input').value"),'卡片旅人');
    await evaluate("document.getElementById('create-dialog').close()");
    await loadSnapshot(savedWorld);
    console.log('v0.6 浏览器角色卡通过：失败导入保持冒险、合法导入、可编辑六维、纯文本显示、实际 JSON 下载、新建编辑与窄屏。');
  }
  if(await evaluate('typeof PixelAssets!=="undefined"')) {
    await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*assets/field.png']});
    await send('Page.reload');await waitReady();assert.equal(await evaluate('PixelAssets.ready'),'failed');
    assert.ok(await evaluate("document.getElementById('asset-status').textContent.includes('后备')"));
    await create();await tick();assert.equal((await model()).status,'alive');
    await send('Network.setBlockedURLs',{urls:[]});await send('Page.reload');await waitReady();
    assert.equal(await evaluate('PixelAssets.ready'),'ready');
  }
  if(await evaluate('typeof FateRules!=="undefined"')) {
    const baseline=await model();
    for(const classId of ['warrior','rogue','mage']){
      const facts=await evaluate(`(()=>{const s=new Adventure.Simulation({classId:'${classId}',seed:'world-browser-003'});let miracle=null,upgrade=null;for(let i=0;i<4000&&s.status==='alive';i++){s.step();if(!miracle&&s.character.rpg.miracles>0)miracle=s.toSave();if(!upgrade&&s.character.rpg.combatLevel>=2)upgrade=s.toSave();}return {miracle,upgrade,final:s.toSave()};})()`);
      assert.ok(facts.miracle,classId+' must actually invoke a miracle');assert.ok(facts.upgrade);assert.equal(facts.final.character.rpg.combatLevel,5);
      await loadSnapshot(facts.miracle);assert.ok(await evaluate("document.getElementById('patron-name').textContent.length>0"));
      assert.equal(await evaluate(`document.getElementById('patron-name').textContent`),({warrior:'赤誓之神·瓦尔铎',rogue:'夜途之神·诺克斯',mage:'星织女神·艾蕾娅'})[classId]);
      await screenshot('miracle-v08-'+classId+'.png');await loadSnapshot(facts.upgrade);await screenshot('upgrade-v08-'+classId+'.png');
      await loadSnapshot(facts.final);assert.equal(await evaluate("document.querySelectorAll('#equipment-slots p').length"),3);
      await click('details');assert.ok(await evaluate("document.getElementById('character-details').textContent.includes('神迹已发动')"));await evaluate("document.getElementById('details-dialog').close()");
    }
    await loadSnapshot(baseline);console.log('v0.8 浏览器实景通过：同种子三职业自然神迹/升级/换装、真实截图、绑定神明/资源/成长显示。');
  }
  // 再打开没有虚拟时钟的页面，检查真实播放与暂停。
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: fileUrl }); await waitReady();
  assert.equal(await evaluate('typeof testClock'), 'undefined');
  await create('warrior', 'real-clock'); await speed('fast');
  await new Promise(resolve => setTimeout(resolve, 270)); await click('toggle');
  const realSave = await model(); assert.ok(realSave.actions >= 1);
  await new Promise(resolve => setTimeout(resolve, 160)); assert.deepEqual(await model(), realSave);
  assert.deepEqual(errors, [], '页面不得出现未捕获异常或模拟内部错误');
  console.log('v0.3 浏览器检查通过：角色创建、世界移动、进入/返回地牢、原有骷髅战斗、战斗暂停调速、1500 次持续行动、商人后续、详情与历史、存取与刷新恢复、重置、死亡停止、三职业、真实计时暂停。');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { browser.kill(); if(server.listening)server.close(); });
