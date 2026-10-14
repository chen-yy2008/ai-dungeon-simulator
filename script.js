/* UI 控制层：一个模拟计时器；所有游戏判定由 Simulation 处理。 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const A = globalThis.Adventure, F = globalThis.FateRules;
  const $ = id => document.getElementById(id);
  const text = (id, value) => { $(id).textContent = value; };
  const cards = globalThis.CharacterCard, editor = new globalThis.CardEditor(cards, $);
  let renderedAbilities = '', renderedClass = '';
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
    const details = sim.world.history.filter(r => ['attack', 'escape', 'decision', 'result', 'battle', 'quest-check', 'quest-followup'].includes(r.type)).slice(-16).reverse();
    $('detail-log').replaceChildren(...details.map(r => entry(r)));
    if (!details.length) { const li = document.createElement('li'); li.textContent = '尚未进行判定。角色出发后，这里将记录真实骰点与重要选择。'; $('detail-log').append(li); }
    if (atBottom || force) story.scrollTop = story.scrollHeight;
  }
  function render(force = false) {
    const c = sim.character, battle = sim.combat?.battle;
    text('clock', timestamp(sim.world.minutes)); text('seed-label', `种子 ${sim.config.seed}`);
    text('character-name', c.name); text('class-label', `${A.CLASSES[c.classId].name} · ${regionNames[c.position.region]}`);
    text('level-label', '背景设定等级 '+c.level+' · 不等于战斗等级');
    const patron=F.PATRONS[c.classId],r=c.rpg;
    text('patron-name',patron.name);text('patron-symbol',patron.symbol);$('patron-symbol').style.background=patron.color; text('patron-oracle',patron.oracle);text('patron-rule',patron.blessing+'。神迹消耗35神眷，一场一次；实际到神龛祈祷，每天一次。'+patron.creed);
    text('combat-level','战斗等级 '+r.combatLevel+' / 5');text('xp-progress',r.combatLevel===5?'成长路线已满级':r.xp+' / '+F.CURVE[r.combatLevel]+' XP');
    text('grace','神眷 '+r.grace+' / 100');text('skill-resource',c.classId==='mage'?'MP '+r.mp+' / '+r.maxMp:'体力 '+r.stamina+' / '+r.maxStamina);
    $('equipment-slots').replaceChildren(...Object.entries(r.equipment).map(([slot,id])=>{const p=document.createElement('p'),icon=document.createElement('img'),label=document.createElement('span');const gear=id?F.item(id):null;icon.src='assets/'+(gear?.icon||'bag')+'.png';icon.alt='';icon.className='item-icon';label.textContent=({weapon:'武器',armor:'护甲',trinket:'饰品'}[slot])+': '+(gear?.name||'尚未装备');p.append(icon,label);return p}));
    const recent=sim.world.history.filter(x=>['miracle','levelup','equip'].includes(x.type)).slice(-1)[0] || sim.world.history.filter(x=>['attack','skill','heal','counter'].includes(x.type)).slice(-1)[0];
    text('battle-replay',recent?'最近关键 · '+timestamp(recent.time)+' · '+recent.title+' · '+recent.text:'等待第一次真实战斗或成长。');
    document.querySelector('.combat-panel').classList.toggle('battle-emphasis',!!battle);

    text('card-ac', c.ac); text('card-goal', A.GOALS[c.goal]); text('card-gear',F.item(c.rpg.equipment.weapon)?.name || '无武器');
    if (renderedClass !== c.classId) { $('portrait').src = 'assets/' + globalThis.PixelAssets.heroes[c.classId] + '-portrait.png'; $('portrait').alt = A.CLASSES[c.classId].name + '原型像素头像'; renderedClass = c.classId; }
    const abilitiesKey = JSON.stringify(c.abilities);
    if (renderedAbilities !== abilitiesKey) { renderedAbilities = abilitiesKey; $('ability-scores').replaceChildren(...A.ABILITIES.map(key => {
      const item = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong');
      const modifier = document.createElement('small'), n = Math.floor((c.abilities[key] - 10) / 2);
      label.textContent = key; value.textContent = c.abilities[key]; modifier.textContent = (n >= 0 ? '+' : '') + n; item.append(label, value, modifier); return item;
    })); }
    text('trait-summary', Object.entries(c.traits).map(([key, value]) => `${A.TRAITS[key]} ${value}`).join(' · '));
    health('hp', 'hp-bar', c.hp, c.maxHp); health('fatigue', 'fatigue-bar', Math.round(c.fatigue), 100);
    text('gold', c.gold); text('potions', c.potions); text('kills', c.kills);
    text('combat-stats', `AC ${c.ac} · 攻击 +${c.attackBonus} · 1d${c.damageSides}+${c.damageBonus}`);
    text('goal', `长期目标：${A.GOALS[c.goal]}`); text('intent', c.intent); text('reason', c.reason);
    text('map-title', sim.phase === 'dungeon' ? '古代遗迹 · 局部地牢' : '艾尔文边境 · 世界地图');
    text('map-caption', sim.phase === 'dungeon' ? '仅观察自身与四邻格 · 保留已知退路' : '边境小镇 → 北部森林 → 古代遗迹');
    $('map-zoom').hidden = sim.phase !== 'dungeon'; text('map-zoom', view.overview ? '跟随冒险者' : '查看遗迹全图');
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
    $('npc-list').replaceChildren(...Object.values(sim.world.npcs).map(n => {
      const li = document.createElement('li'); li.textContent = `${n.name} · ${n.role} / ${n.location.venue} · ${n.available ? '在场' : '休息或旅行'} / 关系 ${n.relationship}`; li.title = n.hours + '\n' + n.memories.slice(-2).map(m => m.text).join('\n'); return li;
    }));
    const stages = { offer: '尚未接取', active: '执行中', combat: '处理遭遇', followup: '等待回访', complete: '已结算' };
    $('quest-list').replaceChildren(...globalThis.LivingWorld.DEFINITIONS.map(q => {
      const li = document.createElement('li'); li.textContent = `${q.title} · ${stages[sim.world.quests[q.id].stage]}`; return li;
    }));
    if (renderedPhase !== sim.phase) { $('dungeon').className = sim.phase === 'dungeon' ? 'dungeon-transition' : 'world-transition'; renderedPhase = sim.phase; }
    view.effects=$('effects-input').checked;view.draw(sim, running); renderLogs(force);
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
  $('map-zoom').addEventListener('click', () => { view.overview = !view.overview; render(); });
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
      if (!raw) { notify('尚无本地冒险存档。'); return; }
      const restored = A.Simulation.fromSave(JSON.parse(raw));
      replaceSimulation(restored); started = true; render(true); $('create-dialog').close();
      notify('已恢复存档并暂停；点击继续模拟后从同一随机源状态继续。');
    } catch (error) { notify(`无法读取：${error.message}`); }
  });
  function classDescription() {
    const c = A.CLASSES[$('class-input').value];
    text('patron-description',F.PATRONS[$('class-input').value].name+' · '+F.PATRONS[$('class-input').value].oracle+' '+F.PATRONS[$('class-input').value].creed+' '+F.PATRONS[$('class-input').value].blessing+' 技能：'+F.SKILLS[$('class-input').value].join('、')+'。');
    text('class-description', `${c.name}：HP ${c.maxHp} · AC ${c.ac} · 攻击 +${c.attackBonus} · 1d${c.damageSides}+${c.damageBonus} · 调查 +${c.exploreBonus} · 脱离 +${c.escapeBonus}。职业技能由AI按资源与风险自行使用，选职业即绑定神明。`);
  }
  $('class-input').addEventListener('change', () => { classDescription(); editor.defaults($('class-input').value); });
  $('class-input').addEventListener('card-import', classDescription);
  Object.keys(A.TRAITS).forEach(key => $(key).addEventListener('input', () => text(`${key}-value`, $(key).value)));
  $('create-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const config = { card: editor.read(), seed: $('seed-input').value.trim() || freshSeed() };
      replaceSimulation(new A.Simulation(config), true); $('create-dialog').close();
    } catch (error) { text('card-notice', error.message); document.querySelector('.card-editor').open = true; return; }
    notify('角色已创建，AI 已接管行动。相同种子和角色配置会产生相同逻辑结果。');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  $('details').addEventListener('click', () => {
    const c = sim.character, rows = [
      ['角色', `${c.name} · ${A.CLASSES[c.classId].name}`], ['长期目标', A.GOALS[c.goal]], ['守护神', F.PATRONS[c.classId].name+' / '+F.PATRONS[c.classId].creed], ['实际成长', '战斗等级 '+c.rpg.combatLevel+'，XP '+c.rpg.xp+'，神迹已发动 '+c.rpg.miracles+' 次'], ['职业技能', JSON.stringify(c.rpg.skills)], ['身份与背景', c.profile.identity + ' / ' + c.profile.background],
      ['价值观与行为', c.profile.values.join('、') + ' / 冒险意愿 ' + c.profile.behavior.riskTolerance + '，助人 ' + c.profile.behavior.altruism + '，自律 ' + c.profile.behavior.discipline],
      ['设定愿望', c.profile.shortGoal + ' / ' + c.profile.longGoal], ['描述能力与弱点', c.profile.basicAbilities.join('、') + ' / ' + c.profile.weaknesses.join('、')], ['位置', `${regionNames[c.position.region]} (${c.position.x}, ${c.position.y})`],
      ['六维与等级', `${A.ABILITIES.map(key => key + ' ' + c.abilities[key]).join(' / ')} · 设定等级 ${c.level}（背景数据；战斗等级和装备决定实际成长）`],
      ['能力', `HP ${c.hp}/${c.maxHp}，AC ${c.ac}，攻击 +${c.attackBonus}，伤害 1d${c.damageSides}+${c.damageBonus}，调查 +${c.exploreBonus}，脱离 +${c.escapeBonus}`],
      ['性格', Object.entries(c.traits).map(([key, value]) => `${A.TRAITS[key]} ${value}`).join(' / ')],
      ['物资', `${c.gold} 金币，${c.potions} 瓶药水，疲劳 ${c.fatigue.toFixed(1)}`], ['背包', c.inventory.map(i => `${i.name}×${i.count}`).join('、')],
      ['已知地点', c.knowledge.map(key => regionNames[key]).join('、')], ...c.memories.map(m => [`记忆 · ${timestamp(m.time)}`, `${m.note}（记起 ${m.count} 次）`])
    ];
    $('character-details').replaceChildren(...rows.map(([label, value]) => {
      const p = document.createElement('p'), strong = document.createElement('strong'); strong.textContent = label; p.append(strong, document.createTextNode(value)); return p;
    })); $('details-dialog').showModal();
  });
  $('edit-character').addEventListener('click', () => {
    running = false; cancelTimer(); render(); editor.fill(cards.exportCharacter(sim.character)); classDescription();
    $('seed-input').value = freshSeed(); $('details-dialog').close(); $('create-dialog').showModal();
    notify('正在编辑新冒险的设定；确认创建前，原冒险保持暂停。');
  });
  $('export-character').addEventListener('click', () => editor.download(cards.exportCharacter(sim.character)));
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
  const mobileMedia = matchMedia('(max-width: 780px)');
  const adaptControls = () => { $('toolbar-more').open = !mobileMedia.matches; };
  adaptControls(); mobileMedia.addEventListener('change', adaptControls);
  document.body.dataset.mobilePanel = 'map';
  document.querySelectorAll('[data-mobile-view]').forEach(button => button.addEventListener('click', () => {
    document.body.dataset.mobilePanel = button.dataset.mobileView;
    document.querySelectorAll('[data-mobile-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    if (button.dataset.mobileView === 'story') $('chronicle').open = true;
  }));
  const assetStatus = () => { const p = globalThis.PixelAssets; text('asset-status', p.status === 'ready' ? '本地 CC0 像素图集已就绪' : '部分图集加载失败，已使用简化后备画面。可重新打开页面重试。'); $('asset-status').classList.toggle('asset-warning', p.status !== 'ready'); render(); };
  globalThis.PixelAssets.ready.then(assetStatus);
  window.addEventListener('pagehide', () => { if (started && storageAvailable) save(false); });
  $('seed-input').value = sim.config.seed; classDescription(); editor.defaults(sim.character.classId); render(true); $('create-dialog').showModal();
})();
