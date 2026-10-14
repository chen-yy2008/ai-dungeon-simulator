'use strict';
const assert = require('node:assert/strict');
const { Simulation, createCharacter, ABILITIES } = require('../world.js');
for (const classId of ['warrior', 'rogue', 'mage']) {
  const c = createCharacter({ classId });
  assert.deepEqual(Object.keys(c.abilities), ABILITIES);
  assert.equal(c.level, 1);
  assert.ok(Object.values(c.abilities).every(n => Number.isInteger(n) && n >= 3 && n <= 20));
}
const sim = new Simulation({ seed: 'migration' });
for (let i = 0; i < 180; i++) sim.step();
const legacy = sim.toSave(); delete legacy.character.abilities; delete legacy.character.level; delete legacy.character.profile;
const restored = Simulation.fromSave(legacy);
assert.deepEqual(restored.character.abilities, createCharacter().abilities);
for (const key of ['hp', 'maxHp', 'ac', 'attackBonus', 'damageSides', 'damageBonus', 'position']) assert.deepEqual(restored.character[key], legacy.character[key]);
assert.equal(restored.random.state, legacy.randomState);
assert.deepEqual(restored.world.history, legacy.world.history);
const bad = sim.toSave(); bad.character.abilities.STR = 100;
assert.throws(() => Simulation.fromSave(bad));
console.log('v0.4 UI data checks passed: six abilities, fixed prototype level, v0.3 save migration and unchanged combat/RNG.');
