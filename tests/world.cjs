'use strict';
const assert = require('node:assert/strict');
const { Simulation, Agent, Random, createCharacter, CLASSES, TOWN, SITES } = require('../world.js');
const { EVENTS, EventEngine } = require('../events.js');
const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function invariants(s) {
  const c = s.character;
  assert.ok(Number.isFinite(c.hp) && c.hp >= 0 && c.hp <= c.maxHp);
  assert.ok(Number.isInteger(c.gold) && c.gold >= 0);
  assert.ok(Number.isInteger(c.potions) && c.potions >= 0 && c.potions <= 9);
  assert.ok(c.fatigue >= 0 && c.fatigue <= 100);
  assert.equal(new Set(c.inventory.map(i => i.id)).size, c.inventory.length);
  assert.ok(c.inventory.every(i => Number.isInteger(i.count) && i.count > 0 && i.value >= 0));
  assert.ok(s.world.history.length <= 2000);
  assert.ok(s.world.supplies >= 0 && s.world.supplies <= 3);
  const grid = s.phase === 'dungeon' ? s.dungeon.grid : s.world.roadMap;
  assert.equal(grid[c.position.y][c.position.x], 1);
  if (s.phase === 'dungeon') {
    assert.deepEqual(s.dungeon.explorer.position, { x: c.position.x, y: c.position.y });
    assert.ok(!s.dungeon.encounters.monsters.some(m => m.hp > 0 && m.x === c.position.x && m.y === c.position.y));
  }
  assert.equal(s.status === 'dead', c.hp === 0);
}

const profiles = [
  { courage: 60, caution: 55, greed: 45, kindness: 65, curiosity: 70 },
  { courage: 100, caution: 0, greed: 100, kindness: 0, curiosity: 100 },
  { courage: 0, caution: 100, greed: 0, kindness: 100, curiosity: 30 }
];
let total = 0, deaths = 0, entries = 0, completions = 0;
const covered = new Set();
for (const [classIndex, classId] of Object.keys(CLASSES).entries()) {
  for (let seed = 1; seed <= 40; seed++) {
    const sim = new Simulation({ seed: `stress-${seed}`, classId, traits: profiles[seed % 3], goal: ['explore', 'wealth', 'survive'][(seed + classIndex) % 3] });
    let movedAtCheckpoint = 0;
    for (let i = 0; i < 5000 && sim.status !== 'dead'; i++) {
      const beforeTime = sim.world.minutes, beforePhase = sim.phase, beforePosition = { ...sim.character.position }, beforeMoves = sim.character.moves;
      const battle = !!sim.combat?.battle;
      sim.step(); total++;
      assert.ok(sim.world.minutes > beforeTime, '每次有效逻辑行动必须推进游戏时间');
      if (sim.phase === beforePhase && sim.character.moves !== beforeMoves) assert.equal(dist(beforePosition, sim.character.position), 1, '实际移动必须逐格');
      if (battle) assert.equal(sim.character.moves, beforeMoves, '攻击、药水与脱离检定均不移动');
      invariants(sim);
      if ((i + 1) % 500 === 0) {
        assert.ok(sim.character.moves > movedAtCheckpoint + 10, '不能长时间停在小镇或无法实现的目标上');
        movedAtCheckpoint = sim.character.moves;
        assert.deepEqual(Simulation.fromSave(sim.toSave()).toSave(), sim.toSave(), '存档必须保留全部状态');
      }
    }
    assert.ok(sim.character.moves > 0);
    if (sim.status === 'dead') deaths++;
    if (sim.dungeon) entries++;
    if (sim.world.ruinsCleared) {
      completions++;
      assert.ok(sim.dungeon.encounters.monsters.every(m => m.hp === 0));
      if (!sim.world.archived) assert.equal(sim.world.history.filter(r => r.type === 'complete').length, 1);
    }
    Object.keys(sim.world.eventDone).forEach(id => covered.add(id));
  }
}
assert.ok(entries > 60 && completions > 30);
assert.equal(covered.size, EVENTS.length, '长期模拟应覆盖事件目录');

// 同种子、同角色条件重现；事件、战斗、撤退各阶段保存后继续也必须一致。
const original = new Simulation({ seed: 'world-browser-003' });
const twin = new Simulation({ seed: 'world-browser-003' });
const stages = new Set();
for (let i = 0; i < 1600; i++) {
  original.step(); twin.step();
  assert.deepEqual(original.toSave(), twin.toSave());
  const stage = original.pending ? 'event' : original.combat?.battle ? 'combat' : original.dungeon?.retreating ? 'retreat' : original.phase;
  if (!stages.has(stage)) {
    stages.add(stage);
    const a = Simulation.fromSave(original.toSave()), b = Simulation.fromSave(original.toSave());
    for (let step = 0; step < 200; step++) { a.step(); b.step(); }
    assert.deepEqual(a.toSave(), b.toSave());
    const direct = new Simulation({ seed: 'world-browser-003' });
    for (let step = 0; step < original.actions + 200; step++) direct.step();
    assert.deepEqual(a.toSave(), direct.toSave(), '存取后续演必须与从出生连续模拟一致');
  }
}
assert.ok(stages.has('event') && stages.has('combat') && stages.has('world') && stages.has('dungeon'));

// 所有事件选项合法结算；成功和失败都由规则输出实际变化。
for (const definition of EVENTS) {
  for (const action of definition.actions) for (const randomValue of action.check ? [0, .999] : [.5]) {
    const sim = new Simulation({ seed: 'event-fixture' });
    sim.character.gold = 100; sim.character.potions = 5; sim.character.hp = 15;
    if (definition.locations.includes('ruins')) sim.enterDungeon();
    else if (definition.locations.includes('forest')) sim.character.position = { ...SITES[0], region: 'forest' };
    if (definition.id === 'merchant_return') sim.world.flags = { merchantChoice: 'help', merchantDue: sim.world.minutes };
    const context = sim.context, engine = sim.events;
    assert.ok(engine.eligible(definition, context));
    const expected = engine.resolve(definition, action, context, () => randomValue);
    const hpBefore = sim.character.hp, goldBefore = sim.character.gold;
    sim.agent.eventAction = () => ({ action, reason: '固定行动检查' }); sim.random.next = () => randomValue;
    sim.startEvent(definition); sim.step();
    assert.equal(sim.character.hp, Math.max(0, Math.min(sim.character.maxHp, hpBefore + (expected.effects.hp || 0))));
    assert.equal(sim.character.gold, goldBefore - (expected.cost.gold || 0) + (expected.effects.gold || 0));
    assert.equal(sim.world.eventDone[definition.id], true);
    assert.equal(engine.eligible(definition, sim.context), false, '已经完成的事件不得重复触发');
    assert.throws(() => engine.resolve(definition, action, sim.context, () => .5));
    invariants(sim);
  }
}

// 商人因果链必须分时、分地点：尚未满足条件不能输出未来奖励。
for (const choice of ['help', 'ignore']) {
  const sim = new Simulation({ seed: 'merchant-chain' });
  sim.character.position = { ...SITES[0], region: 'forest' };
  const first = EVENTS.find(e => e.id === 'merchant'), follow = EVENTS.find(e => e.id === 'merchant_return');
  sim.agent.eventAction = definition => ({ action: definition.actions.find(a => a.id === choice) || definition.actions[0], reason: '固定行动检查' });
  sim.startEvent(first); sim.step();
  assert.equal(sim.world.flags.merchantChoice, choice);
  assert.ok(!sim.world.history.some(r => r.title === follow.title));
  sim.character.position = { ...TOWN, region: 'town' };
  assert.equal(sim.events.eligible(follow, sim.context), false);
  sim.time(120);
  const resumed = Simulation.fromSave(sim.toSave());
  assert.equal(resumed.events.eligible(follow, resumed.context), true);
  const beforeGold = resumed.character.gold;
  resumed.startEvent(follow); resumed.step();
  assert.equal(resumed.character.gold - beforeGold, choice === 'help' ? 14 : 0);
  assert.equal(!!resumed.world.flags.merchantDiscount, choice === 'help');
  assert.equal(resumed.events.eligible(follow, resumed.context), false);
}

const agent = new Agent(), cautious = createCharacter({ traits: profiles[2] }), bold = createCharacter({ traits: profiles[1] });
assert.ok(agent.threshold(cautious) > agent.threshold(bold));
cautious.hp = 2; cautious.potions = 0;
assert.equal(agent.decide({ character: cautious }, () => .5).action, 'retreat');
const exhausted = createCharacter(); exhausted.fatigue = 100;
assert.equal(agent.decide({ character: exhausted }, () => .5).action, 'retreat', '满血也必须判断疲劳风险');
const merchant = EVENTS.find(e => e.id === 'merchant');
const engine = new EventEngine();
assert.equal(engine.available(merchant, { gold: 0, potions: 0 }).length, 1);
assert.equal(agent.eventAction(merchant, merchant.actions, createCharacter({ traits: { kindness: 100, greed: 0, caution: 0 } }), () => .5).action.id, 'potion');

// 无钱无药也不能无限购买或无限休息；公共铺位是恢复兜底。
const poor = new Simulation({ seed: 'poor' }); poor.character.gold = 0; poor.character.potions = 0; poor.character.hp = 1;
for (let i = 0; i < 20; i++) poor.step();
assert.equal(poor.character.gold, 0); assert.ok(poor.character.moves > 0); assert.ok(poor.character.hp > 1);

// 用合法战斗状态确定性覆盖死亡停止，而非等待偶然随机死亡。
const doomed = new Simulation({ seed: 'death' }); doomed.enterDungeon();
doomed.character.hp = 1; doomed.character.potions = 0;
doomed.dungeon.encounters.battle = { target: doomed.dungeon.encounters.monsters[0], turn: 'skeleton', round: 1 };
doomed.random.next = () => .999; doomed.step();
assert.equal(doomed.status, 'dead');
const deadSave = doomed.toSave();
assert.equal(doomed.step(), false); assert.deepEqual(doomed.toSave(), deadSave);
assert.deepEqual(Simulation.fromSave(deadSave).toSave(), deadSave);

const good = original.toSave();
for (const corrupt of [s => { s.version = 999; }, s => { s.character.gold = -1; }, s => { s.character.potions = 1.2; },
  s => { s.character.fatigue = Infinity; }, s => { s.world.roadMap = []; }, s => { s.dungeon.explorer.known[0][0] = 1; },
  s => { s.dungeon.explorer.path = [{ x: 999, y: 999 }]; }, s => { s.pending = { id: 'not-an-event' }; }]) {
  const bad = clone(good); corrupt(bad); assert.throws(() => Simulation.fromSave(bad));
}
assert.equal(new Random('同一种子').next(), new Random('同一种子').next());
const cap = new Simulation(); for (let i = 0; i < 2100; i++) cap.record('check', '检查', '实际测试记录');
assert.equal(cap.world.history.length, 2000); assert.equal(cap.world.archived, 101);
console.log(`v0.3 检查通过：${total} 次逻辑行动 / 120 组角色种子，进入遗迹 ${entries} 组、完成 ${completions} 组、自然死亡 ${deaths} 组；覆盖 ${covered.size} 种事件，因果链、资源不变量、死亡停止、固定种子与存取后续演通过。`);
