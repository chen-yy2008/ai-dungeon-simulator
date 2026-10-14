'use strict';
const assert = require('node:assert/strict');
const Card = require('../character-card.js');
const { Simulation, Agent, createCharacter } = require('../world.js');
const { EVENTS } = require('../events.js');
const basic = Card.fromConfig();
assert.deepEqual(Card.parse(JSON.stringify(basic)), basic);
for (const mutate of [c => c.version = 999, c => c.hp = 999, c => c.gold = 1000,
  c => c.abilities.STR = 21, c => c.traits.greed = -1, c => c.level = 21,
  c => c.behavior.altruism = '100', c => c.values = ['未知价值观'],
  c => c.name = '', c => c.background = 'x'.repeat(1001), c => c.weaknesses = ['飞天'],
  c => c.importantMemories = Array(21).fill('记忆')]) {
  const bad = structuredClone(basic); mutate(bad); assert.throws(() => Card.parse(JSON.stringify(bad)));
}
assert.throws(() => Card.parse('{bad json}'));
assert.throws(() => Card.parse(' '.repeat(65537)));
assert.throws(() => Card.parse(JSON.stringify(basic).replace('"version":'+basic.version, '"version":'+basic.version+',"__proto__":{"polluted":true}')));
assert.equal({}.polluted, undefined);
const imported = structuredClone(basic); imported.name = '远行者'; imported.level = 20; imported.abilities.STR = 20;
imported.identity = '边境学者'; imported.background = '<script>globalThis.pwned=true</script>';
imported.basicAbilities = ['一段能力描述，不执行代码']; imported.importantMemories = ['曾在故乡见过一位商人'];
const sim = new Simulation({endless:true, seed: 'card-replay', card: imported });
assert.equal(sim.character.hp, 30); assert.equal(sim.character.ac, 15); assert.equal(sim.character.damageSides, 8);
assert.equal(sim.character.level, 20); assert.equal(globalThis.pwned, undefined);
assert.ok(sim.character.memories[0].id.startsWith('background-card-'));
assert.ok(sim.character.memories[0].note.startsWith('角色背景：'));
assert.equal(sim.world.flags.merchantChoice, undefined);
const exported = Card.exportCharacter(sim.character);
assert.equal(exported.identity, imported.identity); assert.equal(exported.hp, undefined);
const legacy = new Simulation({endless:true, seed: 'old-save' }); for (let i = 0; i < 90; i++) legacy.step();
const save = legacy.toSave(); delete save.character.profile;
const migrated = Simulation.fromSave(save);
for (const key of ['hp', 'gold', 'potions', 'fatigue', 'inventory', 'memories']) assert.deepEqual(migrated.character[key], save.character[key]);
assert.deepEqual(migrated.world.history, save.world.history); assert.equal(migrated.random.state, save.randomState);
assert.equal(migrated.character.profile.behavior.riskTolerance, 50);
const corrupt = sim.toSave(); corrupt.character.profile.level = 1; assert.throws(() => Simulation.fromSave(corrupt));
// 同等资源和性格，只改变行为/价值观，验证评分真的改变选择。
const agent = new Agent(), merchant = EVENTS.find(e => e.id === 'merchant');
const altruist = Card.fromConfig({ traits: { kindness: 15 } }); altruist.behavior.altruism = 100; altruist.values = ['同情'];
const selfish = structuredClone(altruist); selfish.behavior.altruism = 0; selfish.values = [];
const choose = card => agent.eventAction(merchant, merchant.actions, createCharacter({ card }), () => .5).action.id;
assert.notEqual(choose(altruist), 'ignore'); assert.equal(choose(selfish), 'ignore');
const bold = Card.fromConfig(); bold.behavior.riskTolerance = 100;
const safe = structuredClone(bold); safe.behavior.riskTolerance = 0;
const hero = card => { const c = createCharacter({ card }); c.hp = 10; c.potions = 0; return c; };
assert.equal(agent.decide({ character: hero(bold) }, () => .5).action, 'continue');
assert.equal(agent.decide({ character: hero(safe) }, () => .5).action, 'retreat');
const fearful = hero(safe); fearful.profile.weaknesses = ['畏惧亡灵']; fearful.position.region = 'ruins';
assert.ok(agent.threshold(fearful) > agent.threshold(hero(safe)));
const disciplined = createCharacter(); disciplined.fatigue = 75; disciplined.profile.behavior.discipline = 100;
const relaxed = createCharacter(); relaxed.fatigue = 75; relaxed.profile.behavior.discipline = 0;
assert.equal(agent.decide({ character: disciplined }, () => .5).action, 'retreat');
assert.equal(agent.decide({ character: relaxed }, () => .5).action, 'continue');
// 多配置加速运行与存档续演：受限资源、有限后果及相同种子结果一致。
let actions = 0;
for (const classId of ['warrior', 'rogue', 'mage']) for (const risk of [0, 100]) for (const altruism of [0, 100]) {
  const card = Card.fromConfig({ classId }); card.behavior = { riskTolerance: risk, altruism, discipline: 85 };
  card.values = altruism ? ['同情', '责任'] : ['财富'];
  const a = new Simulation({endless:true, seed: 'profile-' + classId + risk + altruism, card });
  for (let i = 0; i < 2000; i++) {
    a.step(); actions++; assert.ok(a.character.hp >= 0 && a.character.hp <= a.character.maxHp);
    assert.ok(a.character.gold >= 0 && a.character.fatigue >= 0 && a.character.fatigue <= 100);
    if (i === 500) {
      const b = Simulation.fromSave(a.toSave());
      for (let j = 0; j < 40; j++) { a.step(); b.step(); assert.deepEqual(a.toSave(), b.toSave()); }
    }
  }
  assert.ok(a.character.moves > 0);
}
console.log(`v0.6 character checks passed: strict schema/roundtrip, illegal and runtime data rejected, background isolation, old-save migration, behavioral contrasts, ${actions} seeded actions plus save continuation.`);
