'use strict';
const assert = require('node:assert/strict');
const { Simulation, TOWN, SITES } = require('../world.js');
const L = require('../living-world.js');
const clone = x => JSON.parse(JSON.stringify(x));
const sim = new Simulation({endless:true, seed: 'npcs' });
assert.equal(Object.keys(sim.world.npcs).length, 4);
sim.world.minutes = 12 * 60; L.sync(sim.world);
assert.equal(sim.world.npcs.mage.location.region, 'forest');
sim.world.minutes = 20 * 60; L.sync(sim.world);
assert.equal(sim.world.npcs.mage.location.region, 'town'); assert.equal(sim.world.npcs.guild.available, false);
for (const definition of L.DEFINITIONS) for (const branch of ['success', 'failure', 'declined']) {
  const s = new Simulation({endless:true, seed: 'chain-' + definition.id });
  s.world.flags.merchantChoice = 'help'; s.world.flags.merchantDue = 0;
  s.world.minutes = 18 * 60; L.sync(s.world); s.character.position = { ...TOWN, region: 'town' };
  for (const q of Object.values(s.world.quests)) { q.stage = 'complete'; q.branch = 'declined'; }
  const state = s.world.quests[definition.id]; state.stage = 'followup'; state.branch = branch; state.due = s.world.minutes + 1440;
  if (definition.id === 'caravan' && branch === 'success') s.item({ id: 'caravanCargo', name: '待交付商队货物', value: 0 });
  const before = s.character.gold;
  assert.equal(L.tryTown(s), false, '未到时间不得结算');
  s.time(1440); const resumed = Simulation.fromSave(s.toSave());
  // Receiver must actually be present; mage 18:00, merchant/guild earlier.
  if (definition.receiver !== 'mage') { resumed.world.minutes += 15 * 60; L.sync(resumed.world); }
  assert.equal(L.tryTown(resumed), true);
  // tryTown may first wait until opening; next call then resolves.
  if (resumed.world.quests[definition.id].stage !== 'complete') assert.equal(L.tryTown(resumed), true);
  assert.equal(resumed.world.quests[definition.id].stage, 'complete');
  assert.equal(resumed.character.gold - before, branch === 'success' ? definition.reward : branch === 'failure' ? 2 : 0);
  const finished = resumed.toSave(); assert.equal(L.tryTown(resumed), false); assert.deepEqual(resumed.toSave(), finished);
}
const debts = new Simulation({endless:true, seed: 'debt' });
for (const q of Object.values(debts.world.quests)) q.stage = 'complete';
debts.world.quests.favor = { stage: 'followup', branch: 'borrowed', due: 0 };
debts.world.flags.innDebt = 8; debts.character.gold = 0;
assert.equal(L.tryTown(debts), true); assert.equal(debts.world.flags.innDebt, 0); assert.equal(debts.character.gold, 0);
assert.equal(debts.world.minutes, 8 * 60 + 120);
const noLoop = new Simulation();
noLoop.world.quests.caravan = { stage: 'followup', branch: 'failure', due: 0 };
noLoop.world.scouting = 0;
assert.equal(L.tryTown(noLoop), false, '仍在森林的商人不能导致无限等候');
const legacy = new Simulation().toSave(); delete legacy.world.npcs; delete legacy.world.quests;
const migrated = Simulation.fromSave(legacy); assert.equal(Object.keys(migrated.world.npcs).length, 4); assert.equal(migrated.random.state, legacy.randomState);
const malformed = migrated.toSave(); malformed.world.npcs.mage.relationship = 1000; assert.throws(() => Simulation.fromSave(malformed));
let count = 0;
for (let seed = 0; seed < 12; seed++) {
  const a = new Simulation({endless:true, seed: 'living-' + seed }), b = new Simulation({endless:true, seed: 'living-' + seed });
  for (let i = 0; i < 3000 && a.status !== 'dead'; i++) {
    a.step(); b.step(); count++;
    if (i % 100 === 0) assert.deepEqual(a.toSave(), b.toSave());
  }
  assert.ok(Object.values(a.world.quests).every(q => q.stage === 'complete'), '长期模拟应结算五条有限链');
  const gold = a.character.gold, questRecords = a.world.history.filter(r => r.type === 'quest-followup').length;
  assert.ok(gold >= 0); assert.ok(questRecords <= 5); assert.ok(a.character.moves > 100);
}
console.log(`v0.5 checks passed: four schedules, five branching cross-day chains, restored consequences, finite rewards, no impossible merchant wait; ${count} repeatable actions.`);
