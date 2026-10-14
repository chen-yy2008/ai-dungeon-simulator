/* Read-only presentation models and bounded, separate local chronicles. */
(function(root){
  'use strict';
  const F=typeof module!=='undefined'&&module.exports?require('./progression.js'):root.FateRules;
  const N=typeof module!=='undefined'&&module.exports?require('./narrative.js'):root.Chronicler;
  const S=typeof module!=='undefined'&&module.exports?require('./story-rules.js'):root.SagaRules;
  const DEFAULTS={version:1,narration:'full',effects:true};
  const SETTINGS_KEY='ai-dungeon:comfort:v1',BOOK_KEY='ai-dungeon:chronicles:v1';
  const hash=text=>{let n=2166136261;for(const ch of text)n=Math.imul(n^ch.charCodeAt(0),16777619);return (n>>>0).toString(16).padStart(8,'0');};
  function settings(raw){return raw?.version===1&&['full','brief','off'].includes(raw.narration)&&typeof raw.effects==='boolean'?{...DEFAULTS,narration:raw.narration,effects:raw.effects}:{...DEFAULTS};}
  function read(storage,key,fallback){try{const value=storage.getItem(key);return value?JSON.parse(value):fallback;}catch{return fallback;}}
  function loadSettings(storage){return settings(read(storage,SETTINGS_KEY,null));}
  function write(storage,key,value){try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  function validHero(h){return h&&/^[a-f0-9]{8}$/.test(h.id)&&typeof h.name==='string'&&h.name.length<=24&&['warrior','rogue','mage'].includes(h.classId)&&h.patronId===F.PATRONS[h.classId].id&&Object.keys(S.ENDINGS).includes(h.code)&&h.title===S.ENDINGS[h.code]&&Number.isFinite(h.days)&&h.days>=0&&h.days<1e6&&Number.isInteger(h.level)&&h.level>=1&&h.level<=5&&Number.isInteger(h.kills)&&h.kills>=0&&typeof h.choice==='string'&&h.choice.length<=2000&&Array.isArray(h.timeline)&&h.timeline.length<=6&&h.timeline.every(r=>Number.isInteger(r.id)&&r.id>0&&Number.isInteger(r.time)&&r.time>=0&&typeof r.text==='string'&&r.text.length<=2000)&&typeof h.battle==='string'&&h.battle.length<=2000;}
  function loadBook(storage){const b=read(storage,BOOK_KEY,null);return b?.version===1&&Array.isArray(b.heroes)&&b.heroes.length<=30&&b.heroes.every(validHero)&&new Set(b.heroes.map(h=>h.id)).size===b.heroes.length?b:{version:1,heroes:[]};}
  function heroRecord(sim){
    const c=sim.character,s=sim.world.saga,end=s?.ending;if(!end||!['complete','dead'].includes(sim.status))return null;
    const facts=s.milestones,choice=facts.filter(r=>r.type==='saga'&&['caravan-action','stars-action','letter-consequence'].includes(r.facts?.event)).sort((a,b)=>{const weight=r=>['sold','taken','failed'].includes(r.facts.branch)?3:r.facts.event==='stars-action'?2:1;return weight(b)-weight(a)||b.id-a.id;})[0];
    const fight=sim.world.history.filter(r=>r.type==='attack'&&r.facts.hit).sort((a,b)=>(b.facts.damage||0)-(a.facts.damage||0))[0]||facts.find(r=>r.type==='battle');
    const major=facts.filter(r=>['birth','declaration','miracle','levelup','saga','death','ending'].includes(r.type));
    const selected=[major.find(r=>r.type==='birth'),major.find(r=>r.type==='miracle'),major.find(r=>r.type==='levelup'),choice,major.filter(r=>r.type==='saga'&&r.facts.stage==='complete').at(-1),major.find(r=>r.type==='ending')].filter(Boolean);
    const timeline=[...new Map(selected.map(r=>[r.id,r])).values()].sort((a,b)=>a.id-b.id).map(r=>({id:r.id,time:r.time,text:r.text}));
    return {id:hash(JSON.stringify([sim.config.seed,c.profile,end.code,end.time,end.actions])),name:c.name,classId:c.classId,patronId:F.PATRONS[c.classId].id,code:end.code,title:end.title,days:Math.max(0,Number(((end.time-480)/1440).toFixed(1))),level:c.rpg.combatLevel,kills:c.kills,choice:choice?.text||'本次没有已结算的重大主线抉择。',battle:fight?.text||'本次没有记录到实际交锋。',timeline};
  }
  function addHero(book,hero){if(!hero||!validHero(hero))return false;if(book.heroes.some(h=>h.id===hero.id))return false;book.heroes.push(hero);if(book.heroes.length>30)book.heroes.shift();return true;}
  function fateIndex(book){return Object.entries(S.ENDINGS).map(([code,title])=>({code,title,count:book.heroes.filter(h=>h.code===code).length}));}
  const META={levelup:['成长','book',8],equip:['换装','bag',6],gear:['装备','bag',5],favor:['神眷','coin',4],prayer:['祈祷','book',4],miracle:['神迹','book',9],relationship:['关系','coin',7],saga:['命运','book',8],victory:['胜利','dice',7],death:['终止','dice',10],ending:['结局','book',10],skill:['能力','dice',3],declaration:['起行','book',3]};
  function eventCard(r,c){
    const meta=META[r.type];if(!meta)return null;
    let cause='事实#'+r.id+' · '+N.date(r.time),detail=r.text;
    if(r.type==='relationship')cause=`${r.facts.npcName} ${r.facts.delta>=0?'+':''}${r.facts.delta} / ${r.facts.before} → ${r.facts.after}。原因：${r.facts.reason}`;
    if(r.type==='favor')cause='因为'+r.facts.reason+'，神眷实际'+(r.facts.amount>=0?'+':'')+r.facts.amount+'。';
    if(r.type==='miracle')cause=F.PATRONS[c.classId].name+'回应实际风险；消耗'+r.facts.cost+'神眷。';
    if(r.type==='levelup')cause='已经获得的XP达到门槛，选择'+r.facts.route+'成长；设定等级不计入。';
    if(r.type==='equip')cause='职业与等级匹配，比较装备效用后选择更优物品。';
    if(r.type==='saga')cause=r.facts.stage==='complete'?'此前行动 + 到期 + 实际在场回访，才结算这次后果。':'当前阶段与位置条件已满足，保存选择，后续尚未提前发生。';
    return {id:r.id,time:r.time,type:r.type,title:r.title,label:meta[0],icon:meta[1],priority:meta[2],detail,cause};
  }
  function combatCard(r,c){
    if(!r||!['attack','victory','escape','counter','skill','miracle'].includes(r.type))return null;
    const f=r.facts;
    if(r.type==='attack')return {title:(f.turn==='hero'?c.name:f.target)+' · '+(f.skill||'普通攻击'),outcome:f.roll===null?'稳定法术':f.critical?'自然20 · 暴击':f.hit?'命中':'落空',detail:`实际伤害 ${f.damage}，目标HP ${f.hp}${f.reduced?' · 格挡/减伤 '+f.reduced:''}${f.extra?' · 背刺加伤 '+f.extra:''}${f.skill==='霜缚术'?' · 削弱下一次命中+值2':''}`,factId:r.id};
    return {title:r.title,outcome:r.type==='victory'?'胜利':r.type==='escape'?f.success?'脱离成功':'脱离失败':r.type==='miracle'?'神明回应':'实际行动',detail:r.text,factId:r.id};
  }
  class Feedback{
    constructor(){this.sim=null;this.lastId=0;this.cards=[];this.seenSkills=new Set();this.lastIntent='';this.lastGoalAction=-100;this.goal=null;this.raven=null;this.combat=null;}
    observe(sim){
      if(this.sim!==sim){this.sim=sim;this.lastId=sim.actions?Math.max(0,sim.world.recordId-60):0;this.cards=[];this.seenSkills=new Set(Object.keys(sim.character.rpg.skills));this.lastIntent=sim.character.intent;this.goal=null;this.raven=null;this.combat=null;}
      const batch=sim.world.history.filter(r=>r.id>this.lastId),c=sim.character;
      for(const r of batch){
        const fight=combatCard(r,c);if(fight)this.combat=fight;
        const card=eventCard(r,c);
        if(card&&(r.type!=='skill'||!this.seenSkills.has(r.facts.skill))){if(r.type==='skill'){card.title='首次施展 · '+r.facts.skill;this.seenSkills.add(r.facts.skill);}this.cards.push(card);}
        if(N.category(r)&&r.type!=='region'||r.type==='birth')this.raven=r;
      }
      this.cards=this.cards.slice(-8);this.lastId=sim.world.recordId;
      if(this.lastIntent!==c.intent){if(!sim.combat?.battle&&sim.actions-this.lastGoalAction>=12){this.goal={title:c.intent,reason:c.reason,action:sim.actions};this.lastGoalAction=sim.actions;}this.lastIntent=c.intent;}
      return this;
    }
  }
  const api={DEFAULTS,SETTINGS_KEY,BOOK_KEY,settings,loadSettings,write,loadBook,validHero,heroRecord,addHero,fateIndex,eventCard,combatCard,Feedback};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Chronicles=api;
})(globalThis);
