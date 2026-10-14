'use strict';
const assert=require('node:assert/strict');
const C=require('../chronicles.js'),N=require('../narrative.js'),T=require('../tutorial.js');
const {Simulation}=require('../world.js'),E=require('../experience.js'),F=require('../progression.js');
assert.equal(T.TOPICS.length,9);
for(const done of [true,false])for(const skipped of [true,false]){
 const old={version:1,step:4,done,skipped};const next=T.normalize(old);assert.equal(next.step,6);assert.equal(next.done,done);assert.equal(next.skipped,skipped);
}
for(const bad of [null,{}, {version:2,step:10}, {version:2,step:1,done:false,skipped:false,snoozed:true,remindAt:-1}])assert.equal(T.normalize(bad).step,0);
assert.deepEqual(C.settings({version:1,narration:'brief',effects:false}),{version:1,narration:'brief',effects:false});
const storage={values:new Map(),getItem(k){return this.values.get(k)||null;},setItem(k,v){this.values.set(k,v);}};
assert.equal(C.loadSettings(storage).narration,'full');storage.setItem(C.SETTINGS_KEY,'{broken');assert.equal(C.loadSettings(storage).narration,'full');
assert.equal(C.write({setItem(){throw Error('quota');}},'key',{}),false);
assert.equal(C.loadBook({getItem(){throw Error('denied');}}).heroes.length,0);
let total=0;
const book={version:1,heroes:[]};
for(const p of E.PRESETS){
 assert.ok(p.archetype&&p.declaration&&p.identity&&p.values.length&&Object.keys(p.traits).length===5);
 const sim=new Simulation({...p,openingLine:p.declaration});assert.equal(C.heroRecord(sim),null);
 const declaration=sim.world.history.find(r=>r.type==='declaration');assert.equal(declaration.facts.speaker,p.name);assert.equal(declaration.facts.line,p.declaration);
 const feedback=new C.Feedback();feedback.observe(sim);
 while(sim.status==='alive'&&sim.actions<3000){sim.step();total++;const before=JSON.stringify(sim.toSave());feedback.observe(sim);assert.ok(feedback.cards.length<=8);for(const r of sim.world.history.slice(-5))for(const mode of ['full','brief','off']){const text=N.describe(r,sim.character,mode);if(mode==='off')assert.equal(text,'');else if(N.category(r))assert.ok(text.endsWith(r.text));}assert.equal(JSON.stringify(sim.toSave()),before,'Presentation cannot consume RNG or change simulation');}
 assert.notEqual(sim.status,'alive');const before=JSON.stringify(sim.toSave()),hero=C.heroRecord(sim);assert.ok(C.validHero(hero));assert.equal(hero.patronId,F.PATRONS[p.classId].id);assert.ok(hero.timeline.every(r=>sim.world.saga.milestones.some(s=>s.id===r.id&&s.text===r.text)));
 assert.equal(C.addHero(book,hero),true);assert.equal(C.addHero(book,hero),false);assert.equal(C.addHero(book,C.heroRecord(Simulation.fromSave(sim.toSave()))),false);assert.equal(JSON.stringify(sim.toSave()),before);
 for(const r of sim.world.history.filter(r=>r.type==='relationship')){assert.equal(r.facts.after-r.facts.before,r.facts.delta);const card=C.eventCard(r,sim.character);assert.ok(card.cause.includes(r.facts.reason));}
}
assert.equal(book.heroes.length,6);assert.equal(C.fateIndex(book).reduce((n,f)=>n+f.count,0),6);
assert.equal(C.write(storage,C.BOOK_KEY,book),true);assert.deepEqual(C.loadBook(storage),book);
storage.setItem(C.BOOK_KEY,JSON.stringify({...book,heroes:[book.heroes[0],book.heroes[0]]}));assert.equal(C.loadBook(storage).heroes.length,0);
storage.setItem(C.BOOK_KEY,JSON.stringify({version:999,heroes:[]}));assert.equal(C.loadBook(storage).heroes.length,0);
for(let i=0;i<40;i++)C.addHero(book,{...book.heroes[0],id:i.toString(16).padStart(8,'0')});assert.equal(book.heroes.length,30);
const save=new Simulation({seed:'safe-save'}).toSave();const poison=JSON.parse(JSON.stringify(save));Object.defineProperty(poison.config,'__proto__',{value:{polluted:true},enumerable:true});assert.throws(()=>Simulation.fromSave(poison));assert.equal({}.polluted,undefined);
console.log(`v1.1 comfort passed: nine-step legacy migration, three narrator modes, six real endings/${total} actions, bounded fact cards, actual relationship deltas, read-only/RNG invariance, 30-entry dedup archives, corrupt/denied storage and safe save keys.`);
