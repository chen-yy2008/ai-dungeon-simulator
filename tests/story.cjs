'use strict';
const assert=require('node:assert/strict');
const {Simulation,TOWN}=require('../world.js'),S=require('../story-rules.js'),L=require('../living-world.js'),N=require('../narrative.js');
const force=(sim,action)=>{sim.agent.choose=choices=>{const c=choices.find(o=>o.action===action&&o.allowed!==false);assert.ok(c,'Legal chosen action '+action);return {...c,score:c.score||50};};};
const town=sim=>{sim.character.position={...TOWN,region:'town'};sim.phase='world';const next=Math.floor(sim.world.minutes/1440)*1440+18*60;sim.time(next>sim.world.minutes?next-sim.world.minutes:next+1440-sim.world.minutes);};
for(const action of ['return','hide','sell','ignore']){
 const a=new Simulation({seed:'letter-'+action}),q=a.world.saga.letter;
 q.stage='followup';q.branch=action==='ignore'?'ignored':null;q.due=a.world.minutes;
 if(action!=='ignore'){a.item({id:'lastLetter',name:'未送达的信',value:0});force(a,action);}
 const before=a.character.gold;assert.equal(S.tryTown(a),true);assert.equal(q.stage,'complete');assert.equal(a.character.gold,before+(action==='sell'?12:0));assert.equal(a.character.inventory.some(i=>i.id==='lastLetter'),false);
 const relation=a.world.npcs.innkeeper.relationship;S.tryTown(a);assert.equal(a.world.npcs.innkeeper.relationship,relation);assert.deepEqual(Simulation.fromSave(a.toSave()).toSave(),a.toSave());
}
for(const action of ['rescue','ransom','sell','abandon'])for(const success of action==='rescue'?[true,false]:[true]){
 const a=new Simulation({seed:'caravan-'+action});a.character.position={x:5,y:8,region:'forest'};Object.assign(a.world.saga.caravan,{stage:'choice',due:a.world.minutes+120});force(a,action);a.random.next=()=>success?.99:0;
 assert.equal(S.tryForest(a),false,'Cannot conclude before due');a.time(120);const before=a.character.gold;assert.equal(S.tryForest(a),true);assert.equal(a.character.gold,before+(action==='sell'?12:action==='ransom'?-8:0));
 const saved=a.toSave(),b=Simulation.fromSave(saved);assert.equal(S.tryTown(b),false,'No remote NPC conversation');town(b);S.tryTown(b); // letter offer may be first: make finite other stages dormant->complete for this controlled fixture.
 b.world.saga.letter.stage='complete';b.world.saga.letter.branch='ignored';b.world.saga.stars.stage='dormant';
 for(let i=0;i<3&&b.world.saga.caravan.stage!=='complete';i++){S.tryTown(b);}
 assert.equal(b.world.saga.caravan.stage,'complete');assert.equal(b.world.flags.roadSafety,action==='ransom'||action==='rescue'&&success);
 const gold=b.character.gold;S.tryTown(b);assert.equal(b.character.gold,gold);
}
for(const classId of ['warrior','rogue','mage'])for(const action of ['seal','purify','take'])for(const success of action==='purify'?[true,false]:[true]){
 const a=new Simulation({classId,seed:'stars-'+action});a.enterDungeon();const q=a.world.saga.stars;Object.assign(q,{stage:'ritual',clues:[0,1,2]});force(a,action);a.random.next=()=>success?.99:0;
 const before={hp:a.character.hp,gold:a.character.gold,mp:a.character.rpg.mp,potions:a.character.potions};assert.equal(S.tryDungeon(a),true);assert.equal(q.stage,'followup');
 if(action==='purify'){assert.equal(q.branch,success?'purified':'failed');assert.equal(classId==='mage'?a.character.rpg.mp:a.character.potions,(classId==='mage'?before.mp:before.potions)-(classId==='mage'?2:1));}
 if(action==='take'){assert.equal(a.character.gold,before.gold+14);assert.equal(a.character.hp,before.hp-3);}
 assert.equal(S.tryDungeon(a),false,'No duplicate ritual');const b=Simulation.fromSave(a.toSave());b.world.saga.letter.stage='complete';b.world.saga.letter.branch='ignored';town(b);b.time(1440);L.sync(b.world);assert.ok(L.present(b,'mage'));assert.equal(S.tryTown(b),true);assert.equal(b.world.saga.stars.stage,'complete');
}
// Real relationship gates, lodging/prices and crisis aid/refusal.
let a=new Simulation({seed:'relationships'});a.world.npcs.merchant.relationship=15;assert.equal(L.price(a.world,'potion'),6);a.world.npcs.merchant.relationship=-15;assert.equal(L.price(a.world,'potion'),10);
a.world.npcs.innkeeper.relationship=20;assert.equal(L.price(a.world,'inn'),4);
a.character.hp=3;a.world.npcs.innkeeper.relationship=20;assert.equal(S.tryTown(a),true);assert.equal(a.character.hp,11);assert.equal(a.world.history.at(-1).type,'aid');
a=new Simulation({seed:'refused'});a.character.hp=3;a.world.npcs.innkeeper.relationship=-20;assert.equal(S.tryTown(a),true);assert.equal(a.character.hp,3);assert.equal(a.world.history.at(-1).type,'refusal');
a=new Simulation({seed:'quests-refused'});a.world.npcs.guild.relationship=-20;a.world.scouting=2;assert.equal(L.tryTown(a),true);assert.equal(a.world.quests.caravan.branch,'declined');
a=new Simulation({seed:'intel'});a.world.saga.stars.stage='clues';a.world.saga.letter.stage='search';a.world.npcs.mage.relationship=0;assert.deepEqual(S.target(a).target,S.STONES[1]);a.world.npcs.mage.relationship=20;assert.deepEqual(S.target(a).target,S.STONES[0]);
a=new Simulation({classId:'mage',seed:'potion-purify'});a.enterDungeon();a.character.rpg.mp=0;Object.assign(a.world.saga.stars,{stage:'ritual',clues:[0,1,2]});force(a,'purify');S.tryDungeon(a);assert.ok(a.world.history.find(r=>r.type==='saga'&&r.facts.event==='stars-action').text.includes('1瓶药水'));
// Nine narrator categories, immutable facts/RNG, milestone source IDs and strict save rejection.
const categories=new Set();let total=0;const outcomes=new Set();
for(const classId of ['warrior','rogue','mage'])for(let seed=0;seed<16;seed++){
 const s=new Simulation({seed:'saga-'+seed,classId,traits:seed%2?{kindness:100,courage:70,greed:0,caution:40,curiosity:90}:{kindness:5,courage:65,greed:100,caution:60,curiosity:80}});
 for(let i=0;i<3000&&s.status==='alive';i++){s.step();total++;assert.ok(S.valid(s.world));assert.ok(s.character.gold>=0&&s.character.hp>=0);if(i===150){const twin=Simulation.fromSave(s.toSave());for(let j=0;j<20;j++){s.step();twin.step();assert.deepEqual(s.toSave(),twin.toSave());}}}
 assert.notEqual(s.status,'alive','Finite campaign must reach a real conclusion');assert.ok(s.character.moves>0);outcomes.add(s.world.saga.ending.code);
 const before=JSON.stringify(s.toSave());for(const r of s.world.history){const key=N.category(r);if(key)categories.add(key);const text=N.describe(r,s.character);if(key)assert.ok(text.endsWith(r.text));}
 N.biography(s);assert.equal(JSON.stringify(s.toSave()),before,'Narrative cannot mutate or consume RNG');
 for(const r of s.world.saga.milestones){const fact=s.world.history.find(h=>h.id===r.id);if(fact)assert.equal(r.text,fact.text,'Milestone must retain exact source fact');}
 assert.deepEqual(Simulation.fromSave(s.toSave()).toSave(),s.toSave());
 const bad=s.toSave();bad.world.saga.stars.clues=[0,0];assert.throws(()=>Simulation.fromSave(bad));
}
assert.ok(outcomes.size>=3);assert.equal(categories.size,9);
a=new Simulation({seed:'old-saga'});const old=a.toSave();delete old.world.saga;const migrated=Simulation.fromSave(old);assert.equal(migrated.random.state,old.randomState);assert.deepEqual(migrated.world.history,old.world.history);
for(const [branches,expected] of [[{caravan:'rescued',letter:'returned',stars:'sealed'},'guardian'],[{stars:'purified'},'seeker'],[{letter:'sold'},'profiteer'],[{},'survivor']]){const s=new Simulation();for(const [k,v] of Object.entries(branches))s.world.saga[k].branch=v;assert.equal(S.endingCode(s),expected);}
a.character.hp=0;assert.equal(S.endingCode(a),'fallen');
console.log(`v0.9 saga passed: three causal chains/all primary branches/failure/due/real locations/finite rewards, four relationship effects, old save/replay, nine truthful narrator categories; ${total} natural actions and ${outcomes.size} distinct outcomes.`);


a=new Simulation({classId:'mage',seed:'dangerous-rite'});a.enterDungeon();a.character.hp=1;a.character.potions=0;Object.assign(a.world.saga.stars,{stage:'ritual',clues:[0,1,2]});const beforeRite=a.character.hp;assert.equal(S.tryDungeon(a),false);assert.equal(a.character.hp,beforeRite,'Unsafe ritual yields to actual retreat/heal logic');
