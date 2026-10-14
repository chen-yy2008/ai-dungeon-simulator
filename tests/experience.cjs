'use strict';
const assert=require('node:assert/strict');
const {Simulation}=require('../world.js'),E=require('../experience.js'),F=require('../progression.js'),S=require('../story-rules.js');
let total=0,conclusions=0;
for(const p of E.PRESETS){
 const sim=new Simulation(p);while(sim.status==='alive'&&sim.actions<2600)sim.step();assert.notEqual(sim.status,'alive');conclusions++;
 assert.equal(sim.character.profile.patronId,F.PATRONS[p.classId].id);assert.ok(sim.character.rpg.combatLevel>=2||sim.status==='dead');
 const before=JSON.stringify(sim.toSave());const report=E.summary(sim),story=E.biography(sim);assert.ok(report.includes(sim.character.name));assert.ok(story.includes('事实#'));assert.equal(JSON.stringify(sim.toSave()),before);
 assert.deepEqual(Simulation.fromSave(sim.toSave()).toSave(),sim.toSave());
 for(let seed=0;seed<12;seed++){
  const s=new Simulation({...p,endless:true,seed:'maturity-'+seed});
  while(s.actions<5000&&s.status==='alive'){s.step();total++;const c=s.character;assert.ok(c.hp>=0&&c.hp<=c.maxHp&&c.gold>=0&&c.fatigue<=100&&Number.isFinite(c.fatigue));if(s.actions%100===0){assert.ok(F.valid(c));assert.ok(S.valid(s.world));assert.ok(s.world.history.length<=2000&&s.world.saga.milestones.length<=160);}}
  assert.ok(s.character.moves>30);assert.deepEqual(Simulation.fromSave(s.toSave()).toSave(),s.toSave());
 }
 for(const weakness of [[],['不善交际'],['体力不足'],['畏惧亡灵']]){
  const s=new Simulation({...p,seed:'poor-'+weakness.join(),traits:{courage:0,caution:100,greed:0,kindness:0,curiosity:0},weaknesses:weakness});s.character.gold=0;s.character.potions=0;
  while(s.actions<3000&&s.status==='alive'){s.step();total++;}
  assert.notEqual(s.status,'alive','Poor/cautious profiles must progress to a real ending or die');assert.ok(s.character.moves>0);assert.ok(s.character.gold>=0);
 }
}
const legacy=new Simulation({seed:'migrate-v3'}).toSave();delete legacy.world.saga;delete legacy.character.rpg;delete legacy.character.profile.patronId;legacy.character.profile.version=1;
const restored=Simulation.fromSave(legacy);assert.equal(restored.random.state,legacy.randomState);assert.deepEqual(restored.world.history,legacy.world.history);assert.equal(restored.character.gold,legacy.character.gold);
for(const raw of [null,{},'{bad json'])assert.throws(()=>Simulation.fromSave(raw));
console.log(`v1.0 maturity passed: 3 real preset conclusions, ${total} continuous/poor/cautious actions, finite bounds, safe reports, replay and v0.3/v0.6 additive migration.`);

for(const tag of ['03','06']){const old=require('./fixtures/historical-'+tag+'.json');const next=Simulation.fromSave(structuredClone(old));for(const key of ['hp','gold','potions','fatigue','inventory','position'])assert.deepEqual(next.character[key],old.character[key]);assert.deepEqual(next.world.history,old.world.history);assert.equal(next.random.state,old.randomState);for(let i=0;i<300&&next.status==='alive';i++)next.step();assert.ok(next.actions>old.actions);}
console.log('Actual v0.3.0/v0.6.0 source-generated historical fixtures preserve state/RNG and continue 300 actions.');
