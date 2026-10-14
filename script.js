/* UI 控制层：一个模拟计时器；所有游戏判定由 Simulation 处理。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const A = globalThis.Adventure;
  const $ = id => document.getElementById(id);
  const text = (id, value) => { $(id).textContent = value; };
  const STORAGE_KEY = 'ai-dungeon-simulator:v0.3';
  const delays = { slow: 700, normal: 250, fast: 60 };
  const regionNames = { town: '边境小镇', forest: '北部森林', ruins: '古代遗迹' };
  const freshSeed = () => String(Date.now());
  let sim = new A.Simulation({ seed: freshSeed() }), timer = null, running = false, started = false;
  let renderedRecord = -1, renderedPhase = '', historyShown = 0, historySnapshot = [], storageAvailable = true;
  const view = new globalThis.MapView($('dungeon'));
  const timestamp = minute => `第 ${Math.floor(minute / 1440) + 1} 天 ${String(Math.floor(minute % 1440 / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const notify = message => text('notice', message);
  function health(id, bar, current, max) {
    text(id, `${current} / ${max}`); $(bar).style.width = `${current / max * 100}%`;
    $(bar).parentElement.setAttribute('aria-valuenow', current); $(bar).parentElement.setAttribute('aria-valuemax', max);
  }
  function entry(record, story = false) {
    const li = document.createElement(story ? 'article' : 'li');
    const meta = document.createElement('span'); meta.className = 'log-step'; meta.textContent = `${timestamp(record.time)} · ${record.title}`;
    const body = document.createElement('p'); body.textContent = story ? record.story : record.text;
    li.append(meta, body); return li;
  }
  function renderLogs(force = false) {
    if (!force && renderedRecord === sim.world.recordId) return;
    renderedRecord = sim.world.recordId;
    const story = $('story'), atBottom = story.scrollHeight - story.scrollTop - story.clientHeight < 40;
    $('log').replaceChildren(...sim.world.history.slice(-16).reverse().map(r => entry(r)));
    story.replaceChildren(...sim.world.history.slice(-18).map(r => entry(r, true)));
    const details = sim.world.history.filter(r => ['attack', 'escape', 'decision', 'result', 'battle'].includes(r.type)).slice(-16).reverse();
    $('detail-log').replaceChildren(...details.map(r => entry(r)));
    if (!details.length) { const li = document.createElement('li'); li.textContent = '尚未进行判定。角色出发后，这里将记录真实骰点与重要选择。'; $('detail-log').append(li); }
    if (atBottom || force) story.scrollTop = story.scrollHeight;
  }
  function render(force = false) {
    const c = sim.character, battle = sim.combat?.battle;
    text('clock', timestamp(sim.world.minutes)); text('seed-label', `种子 ${sim.config.seed}`);
    text('character-name', c.name); text('class-label', `${A.CLASSES[c.classId].name} · ${regionNames[c.position.region]}`);
    text('level-label', `原型等级 ${c.level} · 暂无升级`);
    $('ability-scores').replaceChildren(...A.ABILITIES.map(key => {
      const item = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong');
      label.textContent = key; value.textContent = c.abilities[key]; item.append(label, value); return item;
    }));
    text('trait-summary', Object.entries(c.traits).map(([key, value]) => `${A.TRAITS[key]} ${value}`).join(' · '));
    health('hp', 'hp-bar', c.hp, c.maxHp); health('fatigue', 'fatigue-bar', Math.round(c.fatigue), 100);
    text('gold', c.gold); text('potions', c.potions); text('kills', c.kills);
    text('combat-stats', `AC ${c.ac} · 攻击 +${c.attackBonus} · 1d${c.damageSides}+${c.damageBonus}`);
    text('goal', `长期目标：${A.GOALS[c.goal]}`); text('intent', c.intent); text('reason', c.reason);
    text('map-title', sim.phase === 'dungeon' ? '古代遗迹 · 局部地牢' : '艾尔文边境 · 世界地图');
    text('map-caption', sim.phase === 'dungeon' ? '仅观察自身与四邻格 · 保留已知退路' : '边境小镇 → 北部森林 → 古代遗迹');
    text('position', `${regionNames[c.position.region]} (${c.position.x}, ${c.position.y})`);
    text('moves', `移动 ${c.moves} 步`); text('actions', `逻辑行动 ${sim.actions} 次`);
    text('progress', sim.dungeon ? `遗迹探索 ${(sim.dungeon.explorer.visited.size / sim.dungeon.floorCount * 100).toFixed(1)}%` : '遗迹尚未进入');
    const state = sim.status === 'dead' ? '冒险失败' : !running ? started ? '暂停' : '等待' : battle ? '战斗中' : sim.pending ? '事件处理中' : '自主冒险中';
    text('status', state); text('toggle', sim.status === 'dead' ? '冒险已结束' : running ? '暂停模拟' : started ? '继续模拟' : '开始模拟');
    $('toggle').disabled = sim.status === 'dead';
    $('enemy-health').hidden = !battle;
    if (battle) {
      const target = battle.target;
      text('event-heading', '自动战斗'); text('event-kind', `第 ${battle.round} 回合`);
      text('combat-info', `${target.name || '骷髅 #' + target.id} · 下一行动：${battle.turn === 'hero' ? c.name : target.name || '骷髅'}`);
      health('enemy-hp', 'enemy-bar', target.hp, target.maxHp);
      text('enemy-stats', `AC ${target.ac} · 攻击 +${target.attackBonus} · 1d${target.damageSides}+${target.damageBonus}`);
    } else if (sim.pending) {
      const definition = globalThis.AdventureEvents.EVENTS.find(e => e.id === sim.pending.id);
      text('event-heading', definition.title); text('event-kind', '等待自主选择');
      text('combat-info', definition.description);
    } else {
      text('event-heading', '当前情景'); text('event-kind', regionNames[c.position.region]);
      text('combat-info', sim.status === 'dead' ? '生命值归零，世界与角色的这次模拟已经停止。' : sim.phase === 'dungeon' ? sim.dungeon.retreating ? '沿已观察的地面走回入口，遗迹状态将被保留。' : '逐格探索地牢；相邻骷髅触发战斗，遗迹物件触发事件。' : '沿公开道路自主旅行；林间事件、补给与休整遵循世界时间。');
    }
    text('inventory', c.inventory.map(item => `${item.name} ×${item.count}`).join(' · ') || '背包为空');
    text('memory-count', `${c.memories.length} 条记忆`);
    $('memories').replaceChildren(...c.memories.slice(-3).reverse().map(memory => {
      const li = document.createElement('li'); li.textContent = memory.note; return li;
    }));
    if (renderedPhase !== sim.phase) { $('dungeon').className = sim.phase === 'dungeon' ? 'dungeon-transition' : 'world-transition'; renderedPhase = sim.phase; }
    view.draw(sim); renderLogs(force);
  }
  function cancelTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function schedule() { cancelTimer(); if (running && sim.status !== 'dead') timer = setTimeout(tick, delays[$('speed').value]); }
  function save(showMessage = true) {
    if (!started) { if (showMessage) notify('请先创建或开始一段冒险。'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sim.toSave())); storageAvailable = true; if (showMessage) notify('已保存角色、时间、世界后果、地牢状态、随机源与事件历史。'); }
    catch { storageAvailable = false; if (showMessage) notify('浏览器未允许本地存储或空间不足。模拟仍可继续，请检查浏览器设置。'); }
  }
  function tick() {
    timer = null;
    if (!running || sim.status === 'dead') return;
    try {
      sim.step(); if (sim.status === 'dead') running = false;
      render(); if (storageAvailable && (sim.actions % 25 === 0 || sim.status === 'dead')) save(false); schedule();
    } catch (error) { running = false; cancelTimer(); render(); notify(`模拟已暂停：${error.message}`); console.error(error); }
  }
  function replaceSimulation(next, autoStart = false) {
    cancelTimer(); sim = next; running = autoStart; started = autoStart;
    renderedRecord = -1; renderedPhase = ''; render(true); schedule();
  }
  $('toggle').addEventListener('click', () => {
    if (sim.status === 'dead') return;
    running = !running; started = true;
    if (!running) { cancelTimer(); save(false); } else schedule(); render();
  });
  $('speed').addEventListener('change', schedule);
  $('regenerate').addEventListener('click', () => {
    replaceSimulation(new A.Simulation({ ...sim.config, seed: freshSeed() }));
    notify('世界已重新生成，同一角色配置从小镇重新开始；旧存档可通过读取恢复。');
  });
  $('new-adventure').addEventListener('click', () => {
    running = false; cancelTimer(); render(); $('seed-input').value = freshSeed(); $('create-dialog').showModal();
  });
  $('save').addEventListener('click', () => save());
  $('load').addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { notify('尚无 v0.3 本地存档。'); return; }
      const restored = A.Simulation.fromSave(JSON.parse(raw));
      replaceSimulation(restored); started = true; render(true); $('create-dialog').close();
      notify('已恢复存档并暂停；点击继续模拟后从同一随机源状态继续。');
    } catch (error) { notify(`无法读取：${error.message}`); }
  });
  function classDescription() {
    const c = A.CLASSES[$('class-input').value];
    text('class-description', `${c.name}：HP ${c.maxHp} · AC ${c.ac} · 攻击 +${c.attackBonus} · 1d${c.damageSides}+${c.damageBonus} · 调查 +${c.exploreBonus} · 脱离 +${c.escapeBonus}。法师仅使用普通攻击，本版没有法术系统。`);
  }
  $('class-input').addEventListener('change', classDescription);
  Object.keys(A.TRAITS).forEach(key => $(key).addEventListener('input', () => text(`${key}-value`, $(key).value)));
  $('create-form').addEventListener('submit', event => {
    event.preventDefault();
    const config = { name: $('name-input').value, classId: $('class-input').value, goal: $('goal-input').value,
      seed: $('seed-input').value.trim() || freshSeed(), traits: Object.fromEntries(Object.keys(A.TRAITS).map(key => [key, Number($(key).value)])) };
    replaceSimulation(new A.Simulation(config), true); $('create-dialog').close();
    notify('角色已创建，AI 已接管行动。相同种子和角色配置会产生相同逻辑结果。');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('details').addEventListener('click', () => {
    const c = sim.character, rows = [
      ['角色', `${c.name} · ${A.CLASSES[c.classId].name}`], ['长期目标', A.GOALS[c.goal]], ['位置', `${regionNames[c.position.region]} (${c.position.x}, ${c.position.y})`],
      ['六维与等级', `${A.ABILITIES.map(key => key + ' ' + c.abilities[key]).join(' / ')} · 原型等级 ${c.level}（暂无成长系统，不影响既有战斗数值）`],
      ['能力', `HP ${c.hp}/${c.maxHp}，AC ${c.ac}，攻击 +${c.attackBonus}，伤害 1d${c.damageSides}+${c.damageBonus}，调查 +${c.exploreBonus}，脱离 +${c.escapeBonus}`],
      ['性格', Object.entries(c.traits).map(([key, value]) => `${A.TRAITS[key]} ${value}`).join(' / ')],
      ['物资', `${c.gold} 金币，${c.potions} 瓶药水，疲劳 ${c.fatigue.toFixed(1)}`], ['背包', c.inventory.map(i => `${i.name}×${i.count}`).join('、')],
      ['已知地点', c.knowledge.map(key => regionNames[key]).join('、')], ...c.memories.map(m => [`记忆 · ${timestamp(m.time)}`, `${m.note}（记起 ${m.count} 次）`])
    ];
    $('character-details').replaceChildren(...rows.map(([label, value]) => {
      const p = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = label; p.append(strong, document.createTextNode(value)); return p;
    })); $('details-dialog').showModal();
  });
  function moreHistory() {
    const history = historySnapshot, end = history.length - historyShown, start = Math.max(0, end - 40);
    $('history-list').append(...history.slice(start, end).reverse().map(r => entry(r)));
    historyShown += end - start; $('history-more').disabled = historyShown >= history.length;
  }
  $('history').addEventListener('click', () => {
    historyShown = 0; historySnapshot = sim.world.history.slice(); $('history-list').replaceChildren();
    text('history-summary', `保留最近 ${sim.world.history.length} 条实际记录，按时间从新到旧浏览。${sim.world.archived ? `更早的 ${sim.world.archived} 条已移出记录上限。` : ''}`);
    moreHistory(); $('history-dialog').showModal();
  });
  $('history-more').addEventListener('click', moreHistory);
  $('card-collapse').addEventListener('click', () => {
    const compact = document.querySelector('.character-panel').classList.toggle('compact');
    $('card-collapse').setAttribute('aria-expanded', String(!compact)); text('card-collapse', compact ? '展开属性' : '折叠属性');
  });
  window.addEventListener('pagehide', () => { if (started && storageAvailable) save(false); });
  $('seed-input').value = sim.config.seed; classDescription(); render(true); $('create-dialog').showModal();
})();
