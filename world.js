(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.DungeonCore;
  const E = typeof module !== 'undefined' && module.exports ? require('./events.js') : root.AdventureEvents;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const copy = value => JSON.parse(JSON.stringify(value));
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const TOWN = { x: 3, y: 16 }, RUINS = { x: 17, y: 4 };
  const SITES = [{ x: 6, y: 13 }, { x: 5, y: 8 }, { x: 11, y: 7 }, { x: 14, y: 10 }, { x: 16, y: 6 }];
  const TRAITS = { courage: '勇敢', caution: '谨慎', greed: '贪婪', kindness: '善良', curiosity: '好奇' };
  const CLASSES = {
    warrior: { name: '战士', ...D.HERO_STATS, exploreBonus: 2, escapeBonus: 2, weapon: '铁剑' },
    rogue: { name: '游荡者', maxHp: 26, ac: 14, attackBonus: 5, damageSides: 6, damageBonus: 4, exploreBonus: 5, escapeBonus: 6, weapon: '短剑' },
    mage: { name: '法师', maxHp: 22, ac: 12, attackBonus: 5, damageSides: 8, damageBonus: 3, exploreBonus: 7, escapeBonus: 4, weapon: '法杖' }
  };
  const GOALS = { explore: '探索边境', wealth: '积累 100 金币', survive: '平安度过三天' };
  const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const DEFAULT_ABILITIES = { warrior: [16, 12, 14, 10, 12, 10], rogue: [10, 16, 12, 12, 14, 10], mage: [8, 12, 12, 16, 14, 10] };
  function characterAbilities(classId) { return Object.fromEntries(ABILITIES.map((key, i) => [key, DEFAULT_ABILITIES[classId][i]])); }

  class Random {
    constructor(seed) {
      let hash = 2166136261;
      for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      this.state = hash >>> 0;
    }
    next() { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 4294967296; }
    integer(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  }

  function createCharacter(config = {}) {
    const classId = CLASSES[config.classId] ? config.classId : 'warrior';
    const stats = CLASSES[classId];
    const defaults = { courage: 60, caution: 55, greed: 45, kindness: 65, curiosity: 70 };
    const traits = Object.fromEntries(Object.keys(TRAITS).map(key => [key,
      Number.isFinite(Number(config.traits?.[key])) ? clamp(Math.round(Number(config.traits[key])), 0, 100) : defaults[key]]));
    return { ...stats, name: String(config.name || '艾尔文').trim().slice(0, 24) || '艾尔文', classId,
      abilities: characterAbilities(classId), level: 1,
      traits, goal: GOALS[config.goal] ? config.goal : 'explore', hp: stats.maxHp,
      gold: 24, potions: 2, fatigue: 0, kills: 0, moves: 0,
      position: { ...TOWN, region: 'town' }, knowledge: ['town', 'forest'], memories: [],
      inventory: [{ id: 'weapon', name: stats.weapon, count: 1, value: 0 }],
      intent: '准备出发', reason: '先了解道路、整理物资，再离开安全的小镇。' };
  }

  function makeRoads() {
    const grid = Array.from({ length: 21 }, () => Array(21).fill(0));
    const connect = (a, b) => {
      let { x, y } = a; grid[y][x] = 1;
      while (x !== b.x) { x += Math.sign(b.x - x); grid[y][x] = 1; }
      while (y !== b.y) { y += Math.sign(b.y - y); grid[y][x] = 1; }
    };
    connect(TOWN, { x: 9, y: 10 });
    for (const site of [...SITES, RUINS]) connect({ x: 9, y: 10 }, site);
    return grid;
  }

  // 世界道路来自小镇公开路图；地下城寻路只传入 Explorer.known。
  function findPath(grid, start, goal, blocked = new Set()) {
    const queue = [start], previous = new Map([[D.keyOf(start.x, start.y), null]]);
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head], key = D.keyOf(p.x, p.y);
      if (p.x === goal.x && p.y === goal.y) {
        const path = []; let cursor = p;
        while (previous.get(D.keyOf(cursor.x, cursor.y)) !== null) {
          path.push({ x: cursor.x, y: cursor.y }); cursor = previous.get(D.keyOf(cursor.x, cursor.y));
        }
        return path.reverse();
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = p.x + dx, y = p.y + dy, nextKey = D.keyOf(x, y);
        if (grid[y]?.[x] !== D.FLOOR || previous.has(nextKey) || blocked.has(nextKey)) continue;
        previous.set(nextKey, p); queue.push({ x, y });
      }
    }
    return [];
  }

  class World {
    constructor() {
      this.name = '艾尔文边境'; this.minutes = 8 * 60; this.roadMap = makeRoads();
      this.flags = {}; this.eventDone = {}; this.siteTimes = {}; this.scouting = 0;
      this.supplies = 3; this.ruinsCleared = false; this.ruinCooldown = 0;
      this.history = []; this.recordId = 0; this.archived = 0;
    }
    get clock() { return { day: Math.floor(this.minutes / 1440) + 1, hour: Math.floor(this.minutes % 1440 / 60), minute: this.minutes % 60 }; }
    advance(minutes) {
      const days = Math.floor((this.minutes + minutes) / 1440) - Math.floor(this.minutes / 1440);
      const before = this.supplies;
      this.minutes += minutes; this.supplies = Math.min(3, this.supplies + days * 2);
      return this.supplies - before;
    }
  }

  class Agent {
    choose(candidates, random) {
      const ranked = candidates.filter(c => c.allowed !== false).map(c => ({ ...c, score: c.score + random() * 4 - 2 }));
      ranked.sort((a, b) => b.score - a.score);
      return ranked[0];
    }
    threshold(character) {
      const t = character.traits;
      return clamp(.18 + t.caution * .0035 - t.courage * .001 - t.greed * .0004 +
        (character.goal === 'survive' ? .12 : 0) + (character.memories.some(m => m.id === 'injured') ? .03 : 0), .15, .6);
    }
    decide(observation, random) {
      const c = observation.character, ratio = c.hp / c.maxHp, threshold = this.threshold(c);
      const tired = c.fatigue >= 80 - c.traits.caution * .12 + c.traits.courage * .06;
      const danger = ratio < threshold || tired;
      return this.choose([
        { action: 'potion', allowed: c.potions > 0 && ratio < .62, score: 60 + (1 - ratio) * 110 + c.traits.caution * .2,
          reason: `生命值仅剩 ${Math.round(ratio * 100)}%，使用已有药水比继续冒险更稳妥。` },
        { action: 'retreat', allowed: danger, score: 120 + Math.max(0, threshold - ratio) * 180 + c.fatigue * .3,
          reason: `${ratio < threshold ? '生命值低于性格决定的风险阈值' : '疲劳过高'}，先返回小镇恢复。` },
        { action: 'continue', score: 40 + c.traits.courage * .2 + c.traits.greed * .1,
          reason: '生命值与物资尚可，继续朝当前目标行动。' }
      ], random);
    }
    eventAction(definition, available, character, random) {
      return this.choose(available.map(action => {
        const traitScore = Object.entries(action.traits).reduce((sum, [trait, weight]) => sum + character.traits[trait] / 100 * weight, 0);
        const risk = (action.risk || 0) * (character.traits.caution * .3 + (1 - character.hp / character.maxHp) * 75 +
          (character.memories.some(m => ['injured', 'cursedChest', 'badElixir'].includes(m.id)) ? 12 : 0));
        const bonus = action.check ? character.exploreBonus * 1.5 : 0;
        return { action, score: action.base + traitScore + bonus - risk +
          (character.goal === 'wealth' ? (action.traits.greed || 0) * .25 : 0),
          reason: `结合性格、${character.goal === 'wealth' ? '财富目标' : '当前目标'}、职业调查能力和当前风险，选择「${action.label}」。` };
      }), random);
    }
  }

  class Simulation {
    constructor(config = {}) {
      this.config = { ...copy(config), seed: String(config.seed || 'elven-003').slice(0, 80) };
      this.random = new Random(this.config.seed); this.world = new World(); this.character = createCharacter(config);
      this.agent = new Agent(); this.events = new E.EventEngine(); this.phase = 'world'; this.status = 'alive';
      this.actions = 0; this.mission = 'forest'; this.destination = null; this.pending = null;
      this.dungeon = null; this.fieldCombat = null; this.lastRest = -1000;
      this.record('birth', '冒险开始', `${this.character.name}在边境小镇醒来，携带 24 金币与 2 瓶治疗药水。`,
        `${this.character.name}带着${GOALS[this.character.goal]}的愿望来到艾尔文边境。`, { seed: this.config.seed });
    }
    get combat() { return this.phase === 'dungeon' ? this.dungeon.encounters : this.fieldCombat; }
    get context() {
      const c = this.character;
      return { region: c.position.region, flags: this.world.flags, done: this.world.eventDone, time: this.world.minutes,
        gold: c.gold, potions: c.potions, exploreBonus: c.exploreBonus };
    }
    record(type, title, text, story = text, facts = {}) {
      const world = this.world;
      world.history.push({ id: ++world.recordId, time: world.minutes, region: this.character.position.region, type, title, text, story, facts: copy(facts) });
      if (world.history.length > 2000) { world.history.shift(); world.archived++; }
    }
    remember(id, note) {
      const memory = this.character.memories.find(m => m.id === id);
      if (memory) { memory.time = this.world.minutes; memory.count++; }
      else this.character.memories.push({ id, note, time: this.world.minutes, count: 1 });
    }
    time(minutes, fatigue = 0) {
      const growth = this.world.advance(minutes);
      this.character.fatigue = clamp(this.character.fatigue + fatigue, 0, 100);
      if (growth) this.record('world', '森林恢复', `经过昼夜，森林可采集的补给恢复了 ${growth} 份。`, undefined, { growth });
    }
    intention(text, reason) { this.character.intent = text; this.character.reason = reason; }
    item(item) {
      const existing = this.character.inventory.find(i => i.id === item.id);
      if (existing) existing.count += item.count || 1;
      else this.character.inventory.push({ ...item, count: item.count || 1 });
    }
    potion() {
      const c = this.character;
      if (!c.potions || c.hp >= c.maxHp) return false;
      const healed = Math.min(12, c.maxHp - c.hp); c.potions--; c.hp += healed; this.time(5);
      this.record('heal', '使用治疗药水', `消耗 1 瓶药水，恢复 ${healed} HP，现为 ${c.hp}/${c.maxHp}。`,
        `${c.name}饮下药水，伤口逐渐闭合。`, { healed, potions: c.potions, hp: c.hp });
      return true;
    }
    observeDungeon() {
      const d = this.dungeon;
      d.explorer.observe((x, y) => d.grid[y][x]);
      for (const m of d.encounters.observe(d.explorer)) this.record('discover', '发现骷髅', `局部视野中发现骷髅 #${m.id}，HP ${m.hp}，AC ${m.ac}。`);
      for (const chest of d.chests) if (!chest.discovered && distance(chest, d.explorer.position) <= 1) {
        chest.discovered = true; this.record('discover', '发现遗迹物件', `发现「${E.EVENTS.find(e => e.id === chest.event).title}」，尚未调查。`);
      }
    }
    enterDungeon() {
      if (!this.dungeon) {
        const map = D.generateDungeon(25, () => this.random.next());
        const monsters = D.spawnSkeletons(map, () => this.random.next());
        const free = [];
        map.grid.forEach((row, y) => row.forEach((tile, x) => {
          if (tile === 1 && distance({ x, y }, map.start) > 1 && !monsters.some(m => m.x === x && m.y === y)) free.push({ x, y });
        }));
        const chests = ['cursed_chest', 'hidden_room', 'ancient_cache'].map(event => ({
          ...free.splice(this.random.integer(0, free.length - 1), 1)[0], event, discovered: false, resolved: false
        }));
        this.dungeon = { ...map, explorer: new D.Explorer(25, map.start),
          encounters: new D.Encounters(monsters, () => this.random.next(), this.character), chests,
          retreating: false, ignoredId: null, milestone: 0 };
      }
      const d = this.dungeon;
      d.explorer.position = { ...d.start }; d.explorer.path = []; d.retreating = false; d.ignoredId = null;
      this.phase = 'dungeon'; this.destination = null;
      this.character.position = { ...d.start, region: 'ruins' }; this.time(10, 1);
      this.intention('探索古代遗迹', '入口已知，沿已观察地面探索，遇到危险时保留退路。');
      this.record('region', '进入古代遗迹', '从森林的遗迹入口进入地下城，世界位置已切换为遗迹内部。');
      this.observeDungeon();
    }
    leaveDungeon() {
      const completed = this.dungeon.explorer.complete;
      this.phase = 'world'; this.character.position = { ...RUINS, region: 'forest' }; this.mission = 'return'; this.destination = { ...TOWN };
      this.world.ruinCooldown = this.world.minutes + 180; this.time(5);
      this.record('region', completed ? '离开已探索遗迹' : '撤出遗迹', '已走回入口，回到世界地图，沿道路返回边境小镇。');
      this.intention('返回边境小镇', completed ? '遗迹奖励已经结算，带战利品返回小镇。' : '保存探索记忆和剩余怪物状态，返回小镇恢复。');
    }
    startEvent(definition, chest = null) {
      if (!definition || !this.events.eligible(definition, this.context)) return false;
      this.pending = { id: definition.id, chest: chest?.event || null };
      this.time(5); this.intention(`处理：${definition.title}`, '先观察事件，再依据性格、资源和风险选择行动。');
      this.record('event', definition.title, definition.description, `${this.character.name}遇见了这样的情景：${definition.description}`, { eventId: definition.id });
      return true;
    }
    resolveEvent() {
      const definition = E.EVENTS.find(e => e.id === this.pending.id);
      const c = this.character;
      const decision = this.agent.eventAction(definition, this.events.available(definition, this.context), c, () => this.random.next());
      const result = this.events.resolve(definition, decision.action, this.context, () => this.random.next());
      const before = { hp: c.hp, gold: c.gold, potions: c.potions, fatigue: c.fatigue };
      for (const [key, cost] of Object.entries(result.cost)) c[key] -= cost;
      const fx = result.effects;
      c.gold = Math.max(0, c.gold + (fx.gold || 0)); c.potions = clamp(c.potions + (fx.potions || 0), 0, 9);
      c.hp = clamp(c.hp + (fx.hp || 0), 0, c.maxHp); this.time(definition.minutes, fx.fatigue || 0);
      if (fx.item) this.item(fx.item);
      if (fx.knowledge && !c.knowledge.includes(fx.knowledge)) c.knowledge.push(fx.knowledge);
      for (const [key, value] of Object.entries(fx.flags || {})) this.world.flags[key] = value?.after ? this.world.minutes + value.after : value;
      if (fx.memory) this.remember(fx.memory, `${definition.title}：${decision.action.label}`);
      this.world.eventDone[definition.id] = true;
      if (this.pending.chest) this.dungeon.chests.find(chest => chest.event === this.pending.chest).resolved = true;
      this.pending = null;
      const changes = Object.keys(before).map(key => ({ key, delta: Number((c[key] - before[key]).toFixed(2)) })).filter(v => v.delta);
      const labels = { hp: 'HP', gold: '金币', potions: '药水', fatigue: '疲劳' };
      const detail = changes.map(v => `${labels[v.key]} ${v.delta > 0 ? '+' : ''}${v.delta}`).join('，');
      const check = result.check ? `d20(${result.check.roll}) + ${result.check.bonus} = ${result.check.total} / DC ${result.check.dc}：${result.check.success ? '成功' : '失败'}。` : '';
      const item = fx.item ? `获得 ${fx.item.name}。` : '';
      const passage = fx.flags?.safePassage ? '已抄录安全退路，今后脱离战斗检定额外 +1。' : '';
      const merchant = definition.id === 'merchant_return' ? this.world.flags.merchantChoice === 'help'
        ? '商人感谢先前的帮助，赠予 14 金币，并提供今后的药水折扣。' : '商人仍记得被无视的经历，这次没有给予报酬。' : '';
      this.intention(decision.action.label, decision.reason);
      this.record('result', definition.title, `选择「${decision.action.label}」。${check}${detail ? detail + '。' : ''}${item}${passage}${merchant}`,
        `${c.name}选择${decision.action.label}。${check ? (result.check.success ? '尝试成功。' : '尝试失败。') : ''}${detail ? detail + '。' : ''}${item}${passage}${merchant}`,
        { eventId: definition.id, actionId: decision.action.id, check: result.check, changes, item: fx.item || null, flags: fx.flags || {} });
      if (fx.combat) {
        const bandit = { ...D.SKELETON_STATS, hp: 12, maxHp: 12, id: 1, name: '盗匪', ...c.position };
        this.fieldCombat = new D.Encounters([bandit], () => this.random.next(), c);
        this.fieldCombat.battle = { target: bandit, round: 1, turn: 'hero' };
        this.record('battle', '与盗匪交战', '选择抵抗后，冒险者与已遇见的盗匪开始交替攻击。');
      }
    }
    beginBattle() {
      const d = this.dungeon;
      if (d.ignoredId && distance(d.explorer.position, d.encounters.monsters.find(m => m.id === d.ignoredId)) > 1) d.ignoredId = null;
      const target = d.encounters.begin(d.explorer, d.ignoredId);
      if (!target) return false;
      this.time(1); this.intention(`与骷髅 #${target.id}交战`, '发现相邻骷髅，停止移动，按规则交替攻击。');
      this.record('battle', '遭遇骷髅', `相邻的骷髅 #${target.id}进入战斗，冒险者先手。`); return true;
    }
    combatStep() {
      const combat = this.combat, c = this.character;
      if (combat.battle.turn === 'hero') {
        const decision = this.agent.decide({ character: c }, () => this.random.next());
        if (decision.action === 'potion') { this.intention('战斗中治疗', decision.reason); this.potion(); combat.battle.turn = 'skeleton'; return; }
        if (decision.action === 'retreat') {
          const roll = this.random.integer(1, 20), bonus = c.escapeBonus + (this.world.flags.safePassage ? 1 : 0);
          const success = roll + bonus >= 12;
          this.time(5, 2); this.intention('尝试脱离战斗', decision.reason);
          this.record('escape', '撤退检定', `d20(${roll}) + ${bonus} = ${roll + bonus} / DC 12：${success ? '脱离成功' : '脱离失败，轮到敌人攻击'}。`, undefined, { roll, bonus, success });
          if (success) {
            this.remember('retreated', '曾因生命或疲劳风险主动撤退');
            if (this.phase === 'dungeon') { this.dungeon.ignoredId = combat.battle.target.id; this.dungeon.retreating = true; this.dungeon.explorer.path = []; }
            else { this.fieldCombat = null; this.destination = { ...TOWN }; this.mission = 'return'; }
            combat.battle = null;
          } else combat.battle.turn = 'skeleton';
          return;
        }
      }
      const result = combat.advance(), target = result.target;
      const attacker = result.turn === 'hero' ? c : target, defender = result.turn === 'hero' ? target : c;
      const name = target.name || `骷髅 #${target.id}`;
      const outcome = result.roll === 1 ? '自然 1，失手' : result.critical ? '自然 20，重击' : result.hit ? '命中' : '失手';
      const text = `${result.turn === 'hero' ? c.name + ' → ' + name : name + ' → ' + c.name}：d20(${result.roll}) + ${attacker.attackBonus} = ${result.total} / AC ${defender.ac}，${outcome}。` +
        (result.hit ? `${result.dice.length}d${attacker.damageSides}+${attacker.damageBonus}（${result.dice.join('+')}+${attacker.damageBonus}）造成 ${result.damage} 伤害，目标 HP ${result.hp}/${defender.maxHp}。` : '没有造成伤害。');
      this.time(1, .5); this.record('attack', `战斗 · 第 ${result.round} 回合`, text, text, { ...result, target: name });
      if (result.turn === 'skeleton' && result.hit) this.remember('injured', '受到敌人攻击，今后更重视退路');
      if (result.victory) {
        const gold = this.random.integer(4, 8); c.gold += gold; c.kills++;
        this.item({ id: target.name ? 'banditToken' : 'bone', name: target.name ? '盗匪铜扣' : '骨雕残片', value: 2 });
        this.record('victory', '战斗胜利', `击败${name}，获得 ${gold} 金币与 1 件${target.name ? '盗匪铜扣' : '骨雕残片'}。`,
          `${c.name}击败了${name}，将实际获得的战利品收入背包。`, { gold, kills: c.kills });
        if (this.phase === 'world') this.fieldCombat = null;
      }
    }
    dungeonStep() {
      const d = this.dungeon, c = this.character;
      const decision = this.agent.decide({ character: c }, () => this.random.next());
      if (decision.action === 'potion') { this.intention('恢复生命', decision.reason); this.potion(); return; }
      if (!d.retreating && decision.action === 'retreat') {
        d.retreating = true; d.explorer.path = []; this.intention('沿已知路线撤退', decision.reason);
        this.remember('retreated', '主动保留退路'); this.record('decision', '主动撤退', decision.reason);
      }
      if (this.beginBattle()) return;
      if (d.retreating || d.explorer.complete) {
        if (distance(d.explorer.position, d.start) === 0) { this.leaveDungeon(); return; }
        const blocked = new Set(d.encounters.monsters.filter(m => m.hp > 0 && d.encounters.discovered.has(m.id)).map(m => D.keyOf(m.x, m.y)));
        const path = findPath(d.explorer.known, d.explorer.position, d.start, blocked);
        if (!path.length) throw new Error('已走过的撤退路线不应中断');
        d.explorer.position = path[0]; d.explorer.steps++; c.moves++;
        c.position = { ...path[0], region: 'ruins' }; this.time(2, .25); this.observeDungeon(); return;
      }
      const chest = d.chests.find(t => t.discovered && !t.resolved && distance(t, d.explorer.position) <= 1);
      if (chest && this.startEvent(E.EVENTS.find(e => e.id === chest.event), chest)) return;
      const event = d.explorer.advance();
      if (event.moved) {
        c.moves++; c.position = { ...d.explorer.position, region: 'ruins' }; this.time(2, .25); this.observeDungeon();
        const milestone = Math.floor(d.explorer.visited.size / d.floorCount * 4);
        if (milestone > d.milestone && milestone < 4) { d.milestone = milestone; this.record('explore', '深入遗迹', `已走过 ${milestone * 25}% 的可达地面。`); }
      } else this.time(1);
      if (!d.explorer.path.length && !d.explorer.planPath().length) {
        d.explorer.complete = true;
        if (!this.world.ruinsCleared) {
          this.world.ruinsCleared = true; c.gold += 18; this.item({ id: 'ruinSeal', name: '遗迹印章', value: 15 });
          this.remember('ruinsCompleted', '已走遍古代遗迹');
          this.record('complete', '遗迹探索完成', '所有可达地面已走过，获得一次性奖励 18 金币与遗迹印章。随后沿已知路线返回入口。');
          this.intention('带战利品返回', '遗迹已探索完毕，一次性奖励已领取，不再重复刷取。');
        }
      }
    }
    townStep() {
      const c = this.character;
      const followup = E.EVENTS.find(e => e.id === 'merchant_return');
      if (this.events.eligible(followup, this.context)) { this.startEvent(followup); return; }
      const loot = c.inventory.filter(i => i.value > 0);
      if (loot.length) {
        const gold = loot.reduce((sum, i) => sum + i.value * i.count, 0); c.gold += gold;
        c.inventory = c.inventory.filter(i => i.value === 0); this.time(10);
        this.record('trade', '出售战利品', `售出 ${loot.map(i => `${i.name}×${i.count}`).join('、')}，获得 ${gold} 金币。`, undefined, { gold, items: loot }); return;
      }
      const hour = this.world.clock.hour;
      if (c.hp < c.maxHp * .95 || c.fatigue > 15 || ((hour >= 22 || hour < 6) && c.fatigue > 8)) {
        const cost = c.gold >= 6 ? 6 : 0, healed = c.maxHp - c.hp;
        c.gold -= cost; c.hp = c.maxHp; c.fatigue = 0; this.time(cost ? 480 : 600); this.lastRest = this.world.minutes;
        this.intention('旅馆休息', '回到安全小镇后恢复生命与疲劳，再准备下一趟旅程。');
        this.record('rest', '旅馆休息', `${cost ? '支付 6 金币入住旅馆' : '金币不足，使用小镇公共铺位'}，休息 ${cost ? 8 : 10} 小时，恢复 ${healed} HP，疲劳归零。`); return;
      }
      const price = this.world.flags.merchantDiscount ? 6 : 8;
      if (c.potions < 2 && c.gold >= price) {
        c.gold -= price; c.potions++; this.time(10); this.record('trade', '购买药水', `花费 ${price} 金币购买 1 瓶治疗药水，现有 ${c.potions} 瓶。`, undefined, { price, potions: c.potions }); return;
      }
      if (!c.knowledge.includes('ruins')) {
        c.knowledge.push('ruins'); this.time(10); this.remember('ruinsRumor', '小镇路图标出了北部遗迹入口');
        this.record('knowledge', '获取遗迹信息', '从小镇公开路图得知森林北部的古代遗迹入口位置。'); return;
      }
      const resume = this.dungeon && !this.world.ruinsCleared && this.world.minutes >= this.world.ruinCooldown;
      this.mission = resume ? 'ruins' : 'forest'; this.destination = { ...(resume ? RUINS : SITES[0]) }; this.time(5);
      this.intention(resume ? '重返未完成的遗迹' : '前往北部森林', resume
        ? '保留地图已有发现，休整后直接前往入口，减少途中疲劳，避免反复撤退却没有进展。'
        : '状态整理完毕，先沿公开道路探索森林，再评估是否进入遗迹。');
      this.record('decision', resume ? '重返遗迹' : '离开小镇', `${c.name}决定带着 ${c.potions} 瓶药水和 ${c.gold} 金币${resume ? '直接重返遗迹' : '前往北部森林'}。`);
    }
    chooseDestination() {
      const c = this.character, t = c.traits;
      const sites = SITES.filter(p => this.world.minutes - (this.world.siteTimes[D.keyOf(p.x, p.y)] ?? -1000) >= 240);
      const candidates = sites.map((p, index) => ({ action: 'forest', target: p,
        score: 35 + t.curiosity * .15 + t.greed * .1 - distance(c.position, p) * .6 + index,
        reason: '选择尚未调查或已经冷却的林间路口，寻找事件与补给。' }));
      candidates.push({ action: 'ruins', target: RUINS,
        allowed: c.knowledge.includes('ruins') && !this.world.ruinsCleared && this.world.scouting >= 2 &&
          this.world.minutes >= this.world.ruinCooldown && c.fatigue < 55 && c.hp / c.maxHp > this.agent.threshold(c) + .12,
        score: 45 + t.curiosity * .35 + t.courage * .15 + (c.goal === 'explore' ? 12 : 0) - c.fatigue * .35,
        reason: '已了解入口并探索过森林，生命与疲劳允许前往古代遗迹。' });
      candidates.push({ action: 'return', target: TOWN, score: sites.length ? 5 : 100,
        reason: '附近路口尚在冷却，回镇整理，避免在两个地点反复游荡。' });
      const choice = this.agent.choose(candidates, () => this.random.next());
      this.mission = choice.action; this.destination = { ...choice.target };
      this.intention(choice.action === 'ruins' ? '前往古代遗迹' : choice.action === 'return' ? '返回边境小镇' : '调查林间道路', choice.reason);
    }
    worldStep() {
      const c = this.character;
      if (distance(c.position, TOWN) === 0 && (!this.destination || distance(this.destination, TOWN) === 0)) {
        c.position.region = 'town'; this.destination = null; this.townStep(); return;
      }
      const decision = this.agent.decide({ character: c }, () => this.random.next());
      if (decision.action === 'potion') { this.intention('恢复生命', decision.reason); this.potion(); return; }
      const late = this.world.clock.hour >= 21 || this.world.clock.hour < 6;
      if (decision.action === 'retreat' || (late && c.fatigue > 20)) {
        this.mission = 'return'; this.destination = { ...TOWN };
        this.intention('返回边境小镇', late ? '天色已晚且已有疲劳，沿已知道路回镇休息。' : decision.reason);
      }
      if (!this.destination) this.chooseDestination();
      if (distance(c.position, this.destination) > 0) {
        const path = findPath(this.world.roadMap, c.position, this.destination);
        if (!path.length) throw new Error('公开道路应当连通');
        const fromTown = c.position.region === 'town';
        c.position = { ...path[0], region: distance(path[0], TOWN) === 0 ? 'town' : 'forest' };
        c.moves++; this.time(10, 1.5);
        if (fromTown) this.record('region', '进入北部森林', '冒险者离开小镇，在世界道路上逐格前行。');
        if (c.position.region === 'town') this.record('region', '回到边境小镇', '冒险者沿道路回到小镇，准备结算物资和休息。');
        return;
      }
      if (this.mission === 'ruins') { this.enterDungeon(); return; }
      const key = D.keyOf(c.position.x, c.position.y);
      this.world.siteTimes[key] = this.world.minutes; this.world.scouting++; this.destination = null;
      const definition = this.events.select(this.context, () => this.random.next());
      if (definition) { this.startEvent(definition); return; }
      if (this.world.supplies > 0) {
        this.world.supplies--; this.item({ id: 'berries', name: '林间草药', value: 4 });
        this.time(15, -2); this.record('forage', '采集林间草药', '消耗森林 1 份可采集补给，获得 1 份林间草药，可带回小镇出售。');
      } else { this.time(10); this.record('survey', '检查林间道路', '这一带的补给已采完，记录路口后继续旅行。'); }
    }
    step() {
      if (this.status === 'dead') return false;
      this.actions++;
      if (this.pending) this.resolveEvent();
      else if (this.combat?.battle) this.combatStep();
      else if (this.phase === 'dungeon') this.dungeonStep();
      else this.worldStep();
      const c = this.character;
      if (c.hp === 0) {
        this.status = 'dead'; this.record('death', '冒险结束', `${c.name}的 HP 归零，本次冒险终止。`); this.intention('冒险失败', '生命值归零，无法继续行动。');
      } else if ((c.goal === 'wealth' && c.gold >= 100) || (c.goal === 'survive' && this.world.clock.day >= 4)) {
        this.record('goal', '初始目标达成', `${GOALS[c.goal]}已达成，接下来继续探索边境。`); this.remember('goalAchieved', GOALS[c.goal]); c.goal = 'explore';
      }
      return this.status !== 'dead';
    }
    toSave() {
      const serializeCombat = combat => combat ? { monsters: combat.monsters, discovered: [...combat.discovered], kills: combat.kills,
        battle: combat.battle ? { targetId: combat.battle.target.id, round: combat.battle.round, turn: combat.battle.turn } : null } : null;
      const dungeon = this.dungeon ? { ...this.dungeon, encounters: serializeCombat(this.dungeon.encounters),
        explorer: { ...this.dungeon.explorer, visited: [...this.dungeon.explorer.visited], deadEnds: [...this.dungeon.explorer.deadEnds] } } : null;
      return copy({ version: 3, config: this.config, randomState: this.random.state, world: { ...this.world }, character: this.character,
        phase: this.phase, status: this.status, actions: this.actions, mission: this.mission, destination: this.destination,
        pending: this.pending, dungeon, fieldCombat: serializeCombat(this.fieldCombat), lastRest: this.lastRest });
    }
    static fromSave(input) {
      validateSave(input);
      const save = copy(input), sim = new Simulation(save.config);
      sim.world = Object.assign(new World(), save.world); sim.character = save.character; sim.random.state = save.randomState;
      // v0.3 additive migration: retain combat statistics, RNG and world facts.
      sim.character.abilities = sim.character.abilities || characterAbilities(sim.character.classId);
      sim.character.level = sim.character.level || 1;
      for (const key of ['phase', 'status', 'actions', 'mission', 'destination', 'pending', 'lastRest']) sim[key] = save[key];
      const restoreCombat = data => {
        if (!data) return null;
        const combat = new D.Encounters(data.monsters, () => sim.random.next(), sim.character);
        combat.discovered = new Set(data.discovered); combat.kills = data.kills;
        if (data.battle) combat.battle = { target: combat.monsters.find(m => m.id === data.battle.targetId), round: data.battle.round, turn: data.battle.turn };
        return combat;
      };
      if (save.dungeon) {
        const d = save.dungeon, explorer = Object.assign(new D.Explorer(25, d.start), d.explorer);
        explorer.visited = new Set(d.explorer.visited); explorer.deadEnds = new Set(d.explorer.deadEnds);
        sim.dungeon = { ...d, explorer, encounters: restoreCombat(d.encounters) };
      }
      sim.fieldCombat = restoreCombat(save.fieldCombat); return sim;
    }
  }

  function validateSave(save) {
    const fail = () => { throw new Error('存档版本不兼容或数据损坏，请新建冒险。'); };
    const number = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(n) && n >= min && n <= max;
    const point = (p, size) => p && Number.isInteger(p.x) && Number.isInteger(p.y) && number(p.x, 0, size - 1) && number(p.y, 0, size - 1);
    const grid = (g, size, values) => Array.isArray(g) && g.length === size && g.every(row => Array.isArray(row) && row.length === size && row.every(v => values.includes(v)));
    if (!save || save.version !== 3 || !save.config || !save.world || !save.character || !['world', 'dungeon'].includes(save.phase) || !['alive', 'dead'].includes(save.status)) fail();
    const c = save.character, w = save.world;
    if (c.abilities && !ABILITIES.every(key => Number.isInteger(c.abilities[key]) && number(c.abilities[key], 3, 20))) fail();
    if (c.level !== undefined && c.level !== 1) fail();
    if (!CLASSES[c.classId] || typeof c.name !== 'string' || c.name.length > 24 || !GOALS[c.goal] || !number(c.maxHp, 1, 100) || !number(c.hp, 0, c.maxHp) ||
      !number(c.gold, 0) || !Number.isInteger(c.gold) || !number(c.potions, 0, 9) || !Number.isInteger(c.potions) || !number(c.fatigue, 0, 100) ||
      !number(c.ac, 1, 30) || !number(c.attackBonus, 0, 20) || !number(c.damageSides, 1, 20) || !number(c.damageBonus, 0, 20) ||
      !number(c.exploreBonus, 0, 20) || !number(c.escapeBonus, 0, 20) || !number(c.moves, 0) || !number(c.kills, 0) ||
      !Object.keys(TRAITS).every(key => number(c.traits?.[key], 0, 100)) || !point(c.position, save.phase === 'world' ? 21 : 25) ||
      !['town', 'forest', 'ruins'].includes(c.position.region) || !Array.isArray(c.knowledge) || !c.knowledge.every(k => ['town', 'forest', 'ruins'].includes(k)) ||
      !Array.isArray(c.memories) || c.memories.length > 100 || !c.memories.every(m => typeof m.id === 'string' && typeof m.note === 'string' && number(m.count, 1) && number(m.time, 0)) ||
      !Array.isArray(c.inventory) || c.inventory.length > 30 || !c.inventory.every(i => typeof i.id === 'string' && typeof i.name === 'string' && number(i.count, 1) && Number.isInteger(i.count) && number(i.value, 0)) ||
      typeof c.intent !== 'string' || typeof c.reason !== 'string' || new Set(c.inventory.map(i => i.id)).size !== c.inventory.length) fail();
    if (!number(w.minutes, 0) || !Number.isInteger(w.minutes) || !grid(w.roadMap, 21, [0, 1]) || !w.flags || !w.eventDone || !w.siteTimes ||
      !number(w.supplies, 0, 3) || !number(w.scouting, 0) || !number(w.ruinCooldown, 0) || typeof w.ruinsCleared !== 'boolean' ||
      !Array.isArray(w.history) || w.history.length > 2000 || !number(w.recordId, 0) || !number(w.archived, 0) ||
      !w.history.every(r => number(r.id, 1) && number(r.time, 0, w.minutes) && ['title', 'text', 'story', 'type', 'region'].every(k => typeof r[k] === 'string')) ||
      !number(save.randomState, 0, 4294967295) || !Number.isInteger(save.randomState) || !number(save.actions, 0) || !number(save.lastRest, -1000) ||
      !['forest', 'ruins', 'return'].includes(save.mission) || (save.destination && !point(save.destination, 21)) ||
      Object.keys(w.eventDone).some(id => !E.EVENTS.some(e => e.id === id)) || Object.values(w.siteTimes).some(t => !number(t, 0, w.minutes))) fail();
    if (JSON.stringify(w.roadMap) !== JSON.stringify(makeRoads()) || Object.values(w.eventDone).some(done => done !== true) ||
      w.history.some((r, i) => i && (r.time < w.history[i - 1].time || r.id <= w.history[i - 1].id))) fail();
    if (save.status === 'dead' && c.hp !== 0 || save.status === 'alive' && c.hp === 0) fail();
    if (w.flags.merchantChoice && (!['help', 'ignore'].includes(w.flags.merchantChoice) || !number(w.flags.merchantDue, 0))) fail();
    if (save.pending && (!E.EVENTS.some(e => e.id === save.pending.id) || w.eventDone[save.pending.id])) fail();
    const combat = data => {
      if (!data || !Array.isArray(data.monsters) || !Array.isArray(data.discovered) || !number(data.kills, 0)) fail();
      if (!data.monsters.every(m => point(m, 25) && number(m.hp, 0, m.maxHp) && number(m.maxHp, 1, 30) && number(m.ac, 1, 30) && number(m.attackBonus, 0, 20) && number(m.damageSides, 1, 20) && number(m.damageBonus, 0, 20))) fail();
      if (new Set(data.monsters.map(m => m.id)).size !== data.monsters.length || data.discovered.some(id => !data.monsters.some(m => m.id === id))) fail();
      if (data.battle && (!data.monsters.some(m => m.id === data.battle.targetId && m.hp > 0) || !['hero', 'skeleton'].includes(data.battle.turn) || !number(data.battle.round, 1))) fail();
    };
    if (save.dungeon) {
      const d = save.dungeon, ex = d.explorer;
      if (!grid(d.grid, 25, [0, 1]) || !ex || !grid(ex.known, 25, [-1, 0, 1]) || !point(d.start, 25) || d.grid[d.start.y][d.start.x] !== 1 ||
        !point(ex.position, 25) || d.grid[ex.position.y][ex.position.x] !== 1 || !number(d.floorCount, 1, 625) || !Array.isArray(ex.visited) ||
        !Array.isArray(ex.deadEnds) || !Array.isArray(ex.path) || !ex.path.every(p => point(p, 25)) || !number(ex.steps, 0) ||
        !Array.isArray(d.chests) || !d.chests.every(t => point(t, 25) && E.EVENTS.some(e => e.id === t.event)) ||
        typeof d.retreating !== 'boolean' || typeof ex.complete !== 'boolean' || !number(d.milestone, 0, 3)) fail();
      combat(d.encounters);
      const tileKey = key => {
        if (typeof key !== 'string' || !/^\d+,\d+$/.test(key)) return false;
        const [x, y] = key.split(',').map(Number);
        return point({ x, y }, 25) && ex.known[y][x] === 1;
      };
      if (!ex.visited.every(tileKey) || !ex.deadEnds.every(tileKey) || new Set(ex.visited).size !== ex.visited.length ||
        d.floorCount !== d.grid.flat().filter(t => t === 1).length || ex.known.some((row, y) => row.some((v, x) => v !== -1 && v !== d.grid[y][x])) ||
        d.encounters.monsters.some(m => d.grid[m.y][m.x] !== 1) ||
        (d.ignoredId !== null && !d.encounters.monsters.some(m => m.id === d.ignoredId)) ||
        d.chests.length !== 3 || new Set(d.chests.map(t => t.event)).size !== 3 ||
        d.chests.some(t => !['cursed_chest', 'hidden_room', 'ancient_cache'].includes(t.event) || typeof t.discovered !== 'boolean' || typeof t.resolved !== 'boolean' ||
          (t.resolved && !w.eventDone[t.event]) || d.grid[t.y][t.x] !== 1)) fail();
      let previous = ex.position;
      for (const p of ex.path) { if (distance(previous, p) !== 1 || ex.known[p.y][p.x] !== 1) fail(); previous = p; }
      if (save.phase === 'dungeon' && (c.position.region !== 'ruins' || distance(c.position, ex.position) !== 0)) fail();
    } else if (save.phase === 'dungeon') fail();
    if (save.phase === 'world' && (w.roadMap[c.position.y][c.position.x] !== 1 || c.position.region !== (distance(c.position, TOWN) === 0 ? 'town' : 'forest'))) fail();
    if (save.pending) {
      const definition = E.EVENTS.find(e => e.id === save.pending.id);
      if (!definition.locations.includes(c.position.region) || (save.pending.chest && (!save.dungeon ||
        !save.dungeon.chests.some(t => t.event === save.pending.chest && t.event === save.pending.id && t.discovered && !t.resolved)))) fail();
    }
    if (save.fieldCombat) combat(save.fieldCombat);
  }

  const api = { Random, World, Agent, Simulation, createCharacter, CLASSES, TRAITS, GOALS, ABILITIES, characterAbilities, TOWN, RUINS, SITES, findPath, validateSave };
  root.Adventure = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
