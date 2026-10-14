'use strict';
const assert=require('node:assert/strict');
const D=require('../core.js'),F=require('../progression.js'),C=require('../character-card.js');
const {Simulation,createCharacter,TOWN}=require('../world.js');
function fixture(classId){
  const s=new Simulation({classId,seed:'fate-fixture'}),c=s.character;
  c.position={x:6,y:13,region:'forest'};c.rpg.grace=0;
  const enemy={...D.SKELETON_STATS,hp:10,id:1,name:'测试骷髅',x:6,y:13};
  s.fieldCombat=new D.Encounters([enemy],()=>s.random.next(),c);
  s.fieldCombat.battle={target:enemy,round:1,turn:'hero'};F.beginBattle(c);return s;
}
for(const classId of ['warrior','rogue','mage']){
  const c=createCharacter({classId});assert.equal(c.profile.patronId,F.PATRONS[classId].id);assert.equal(c.rpg.combatLevel,1);
  const card=C.exportCharacter(c);assert.equal(card.version,2);assert.equal(card.patronId,F.PATRONS[classId].id);assert.equal(card.rpg,undefined);
  const v1=structuredClone(card);delete v1.patronId;v1.version=1;assert.equal(C.parse(JSON.stringify(v1)).patronId,card.patronId);
  const bad=structuredClone(card);bad.patronId='unknown';assert.throws(()=>C.parse(JSON.stringify(bad)));
  const s=new Simulation({classId,seed:'prayer'});s.character.position={x:6,y:13,region:'forest'};
  const before=s.character.rpg.grace;assert.equal(F.maintenance(s),false);assert.equal(s.character.rpg.grace,before);
  s.character.position={...TOWN,region:'town'};assert.equal(F.maintenance(s),true);assert.equal(s.character.rpg.grace,before+20);
  const last=s.character.rpg.lastPrayer;F.maintenance(s);assert.equal(s.character.rpg.lastPrayer,last);
  s.time(1440);assert.equal(F.maintenance(s),true);assert.ok(s.character.rpg.grace<=100);
}
let s=fixture('warrior');s.random.next=()=>.5;s.step();assert.ok(s.character.rpg.skills['盾击']);assert.equal(s.character.rpg.battle.weaken,2);assert.equal(s.fieldCombat.battle.turn,'skeleton');
s=fixture('warrior');s.character.hp=14;s.character.potions=0;s.step();assert.equal(s.character.rpg.skills['守护姿态'],1);assert.equal(s.character.rpg.battle.guard,4);assert.equal(s.fieldCombat.battle.turn,'skeleton');
s=fixture('rogue');s.random.next=()=>.5;s.step();assert.equal(s.character.rpg.skills['背刺'],1);assert.ok(s.world.history.some(r=>r.type==='attack'&&r.facts.extra>0));
s=fixture('rogue');s.character.hp=6;s.character.potions=0;s.step();assert.equal(s.character.rpg.skills['灵巧脱离'],1);assert.ok(s.world.history.some(r=>r.type==='escape'));
s=fixture('mage');s.step();assert.equal(s.character.rpg.skills['霜缚术'],1);assert.equal(s.character.rpg.mp,9);assert.equal(s.character.rpg.battle.weaken,2);
s=fixture('mage');s.fieldCombat.battle.round=2;s.step();assert.equal(s.character.rpg.skills['奥术飞弹'],1);assert.equal(s.fieldCombat.battle.target.hp,6);
// 三个神迹真的结算，并验证一次成本、一次战斗限额与敌方回合。
s=fixture('warrior');s.character.hp=1;s.character.rpg.grace=35;s.fieldCombat.battle.turn='skeleton';s.random.next=()=>.999;s.step();assert.equal(s.character.hp,1);assert.equal(s.character.rpg.grace,0);assert.equal(s.character.rpg.miracles,1);
s.fieldCombat.battle.turn='skeleton';s.step();assert.equal(s.character.hp,0);assert.equal(s.status,'dead');const actions=s.actions;s.step();assert.equal(s.actions,actions);
s=fixture('rogue');s.character.hp=6;s.character.potions=0;s.character.rpg.grace=35;s.step();assert.equal(s.character.rpg.grace,10);assert.equal(s.world.history.find(r=>r.type==='miracle').facts.cost,35);assert.equal(s.character.rpg.miracles,1);assert.equal(s.fieldCombat,null);assert.equal(s.mission,'return');
s=fixture('mage');s.character.rpg.mp=0;s.character.rpg.grace=35;s.step();assert.equal(s.character.rpg.mp,5);assert.equal(s.character.rpg.grace,0);assert.equal(s.character.rpg.miracles,1);assert.equal(s.fieldCombat.battle.turn,'skeleton');
// XP/装备有限来源；设定20级不等于战斗20级。
s=new Simulation({seed:'growth',card:C.fromConfig({level:20})});const hp=s.character.maxHp;
F.gainXP(s,24,'one','测试一次真实经验源');assert.equal(s.character.rpg.combatLevel,2);assert.ok(s.character.maxHp>hp);assert.equal(s.character.level,20);
const xp=s.character.rpg.xp;F.gainXP(s,24,'one','重复源');assert.equal(s.character.rpg.xp,xp);
const ac=s.character.ac;F.awardGear(s,'armor','armor');assert.ok(s.character.ac>ac);
const owned=s.character.rpg.owned.length;F.awardGear(s,'armor','armor');assert.equal(s.character.rpg.owned.length,owned);
for(const [eventId,actionId] of [['hidden_room','leave'],['cursed_chest','seal']]){
  const a=new Simulation({seed:'not-looted'});F.onFact(a,'result',{eventId,actionId,check:null});assert.equal(a.character.rpg.owned.length,1,'Refusing loot cannot grant equipment');
}
for(const [eventId,actionId] of [['hidden_room','search'],['ancient_cache','open'],['cursed_chest','open']]){
  const a=new Simulation({seed:'looted'});F.onFact(a,'result',{eventId,actionId,check:{success:false}});assert.equal(a.character.rpg.owned.length,1);
  F.onFact(a,'result',{eventId,actionId,check:{success:true}});assert.equal(a.character.rpg.owned.length,2);
  F.onFact(a,'result',{eventId,actionId,check:{success:true}});assert.equal(a.character.rpg.owned.length,2);
}
const legacy=new Simulation({seed:'legacy'}).toSave();delete legacy.character.rpg;delete legacy.character.profile.patronId;legacy.character.profile.version=1;
const migrated=Simulation.fromSave(legacy);assert.equal(migrated.character.rpg.combatLevel,1);
for(const key of ['hp','gold','potions','fatigue','inventory'])assert.deepEqual(migrated.character[key],legacy.character[key]);assert.equal(migrated.random.state,legacy.randomState);assert.deepEqual(migrated.world.history,legacy.world.history);
for(const mutate of [r=>r.mp=-1,r=>r.grace=101,r=>r.equipment.weapon='fake',r=>r.growth.attack=99,r=>r.combatLevel=5]){const bad=migrated.toSave();mutate(bad.character.rpg);assert.throws(()=>Simulation.fromSave(bad));}
// 临近闭店开始的合法交谈可以完成，且不能跨地图伪造在场。
s=new Simulation({seed:'closing'});s.world.flags.merchantChoice='help';s.world.flags.merchantDue=0;s.time(597);
const event=require('../events.js').EVENTS.find(e=>e.id==='merchant_return');assert.equal(s.startEvent(event),true);assert.equal(s.world.npcs.merchant.available,false);s.step();assert.equal(s.world.eventDone.merchant_return,true);
let total=0;const used=new Set(),miracles=new Set();
for(const classId of ['warrior','rogue','mage'])for(let seed=0;seed<16;seed++){
  const a=new Simulation({classId,seed:'fate-'+seed,traits:seed%2?{caution:90,courage:35,kindness:80}:{courage:80,caution:30,curiosity:85}});
  for(let i=0;i<2500&&a.status==='alive';i++){
    a.step();total++;const c=a.character,r=c.rpg;assert.ok(F.valid(c));assert.ok(c.hp>=0&&c.hp<=c.maxHp);assert.ok(c.gold>=0&&c.fatigue>=0&&c.fatigue<=100);
    if(i===200){const b=Simulation.fromSave(a.toSave());for(let j=0;j<30;j++){a.step();b.step();assert.deepEqual(a.toSave(),b.toSave());}}
  }
  Object.keys(a.character.rpg.skills).forEach(k=>used.add(k));if(a.character.rpg.miracles)miracles.add(classId);
  assert.ok(a.character.moves>0);assert.ok(a.character.rpg.combatLevel>1||a.status==='dead');
}
assert.equal(used.size,6,'All six skills must actually occur in seeded play');assert.equal(miracles.size,3,'All three divine miracles must occur in seeded play');
console.log(`v0.8 fate checks passed: six skills, three actual miracles, costs/turns/death, level/equipment effects, finite sources, v1-card/save migration, closing-time interaction, ${total} seeded actions and replay.`);
