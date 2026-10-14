/* v0.8 规则：神眷、成长、装备与有限职业技能。只由 Simulation 调用。 */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.DungeonCore;
  const PATRONS = {
    warrior: { id: 'valdor', name: '赤誓之神·瓦尔铎', symbol: '誓', color: '#bb7355', oracle: '先守住身后的灯火，再举起你的剑。', creed: '守护与勇气；帮助、抗敌得到神眷，勒索牟利损失神眷。', blessing:'生命低于40%时本场一次减伤2；不屈誓言格挡反击或抵挡一次致死攻击', miracle: '不屈誓言' },
    rogue: { id: 'nox', name: '夜途之神·诺克斯', symbol: '月', color: '#79a5a0', oracle: '道路不只一条，活着的人才有选择。', creed: '机敏与自由；调查、脱离得到神眷，盲目买下可疑物品损失神眷。', blessing:'首次脱离检定+1；影步沿已知路线紧急撤离', miracle: '影步' },
    mage: { id: 'aeleia', name: '星织女神·艾蕾娅', symbol: '✧', color: '#aa93ca', oracle: '知识不是捷径，而是你亲手织出的光。', creed: '知识与节制；解读、研究得到神眷，放弃符文调查损失神眷。', blessing:'首次法术消耗-1，符文调查+1；秘法回响恢复至多5MP并强化下一法术3伤害', miracle: '秘法回响' }
  };
  const gear = (id, name, classId, slot, level, price, bonuses, icon) => ({ id, name, classId, slot, level, price, bonuses, icon });
  const GEAR = [
    gear('starter-warrior','铁剑','warrior','weapon',1,0,{},'bag'), gear('starter-rogue','短剑','rogue','weapon',1,0,{},'bag'), gear('starter-mage','法杖','mage','weapon',1,0,{},'book'),
    gear('oath-blade','誓卫长剑','warrior','weapon',1,18,{ attack:1, damage:1 },'bag'), gear('iron-coat','铁鳞甲','warrior','armor',2,16,{ ac:2 },'bag'), gear('heart-token','守护纹章','warrior','trinket',3,14,{ health:3, heal:2 },'coin'),
    gear('night-dagger','夜路匕首','rogue','weapon',1,18,{ attack:1, damage:1 },'bag'), gear('quiet-coat','轻步皮甲','rogue','armor',2,16,{ ac:2 },'bag'), gear('path-token','旅途护符','rogue','trinket',3,14,{ focus:2 },'coin'),
    gear('star-staff','星纹法杖','mage','weapon',1,18,{ attack:1, focus:1 },'book'), gear('woven-robe','织光长袍','mage','armor',2,16,{ ac:2 },'bag'), gear('rune-token','符文镜片','mage','trinket',3,14,{ focus:2, heal:1 },'book')
  ];
  const SKILLS = { warrior: ['盾击','守护姿态'], rogue: ['背刺','灵巧脱离'], mage: ['奥术飞弹','霜缚术'] };
  const CURVE = [0, 24, 65, 120, 200];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const baseKeys = ['maxHp','ac','attackBonus','damageSides','damageBonus','exploreBonus','escapeBonus'];
  const item = id => GEAR.find(g => g.id === id);
  function install(c) {
    if (c.rpg) return;
    c.rpg = { version:1, combatLevel:1, xp:0, growth:{ hp:0, attack:0, skill:0 }, base:Object.fromEntries(baseKeys.map(k => [k,c[k]])),
      equipment:{ weapon:'starter-'+c.classId, armor:null, trinket:null }, owned:['starter-'+c.classId],
      grace:12, lastPrayer:-1440, sources:{}, skills:{}, miracles:0, battle:null, mp:0, stamina:0 };
    apply(c); c.rpg.mp = c.rpg.maxMp; c.rpg.stamina = c.rpg.maxStamina;
  }
  function bonuses(c) {
    const result = { attack:0, damage:0, ac:0, health:0, focus:0, heal:0 };
    for (const id of Object.values(c.rpg.equipment)) if (id) for (const [key,value] of Object.entries(item(id).bonuses)) result[key] += value;
    return result;
  }
  function apply(c) {
    const r=c.rpg,b=r.base,g=r.growth,e=bonuses(c),old=c.maxHp;
    c.maxHp=b.maxHp+(r.combatLevel-1)*2+g.hp+e.health;
    c.hp=c.hp>0?clamp(c.hp+Math.max(0,c.maxHp-old),0,c.maxHp):0;
    c.ac=b.ac+e.ac; c.attackBonus=b.attackBonus+Math.floor((r.combatLevel-1)/2)+g.attack+e.attack;
    c.damageSides=b.damageSides; c.damageBonus=b.damageBonus+e.damage+Math.floor(g.skill/2);
    c.exploreBonus=b.exploreBonus+e.focus; c.escapeBonus=b.escapeBonus+(c.classId==='rogue'?e.focus:0);
    r.maxMp=c.classId==='mage'?8+r.combatLevel*2+g.skill+e.focus:0; r.maxStamina=c.classId==='mage'?0:7+g.skill;
    r.mp=clamp(r.mp,0,r.maxMp);r.stamina=clamp(r.stamina,0,r.maxStamina);
  }
  function claim(c,key) { if(c.rpg.sources[key])return false;c.rpg.sources[key]=true;return true; }
  function favor(sim, amount, reason, source) {
    const c=sim.character;if(!claim(c,'faith:'+source))return;
    const before=c.rpg.grace;c.rpg.grace=clamp(before+amount,0,100);
    if(before!==c.rpg.grace)sim.record('favor','神眷变化',`${PATRONS[c.classId].name}：${reason}。神眷 ${before} → ${c.rpg.grace}。`,undefined,{amount:c.rpg.grace-before,reason});
  }
  function gainXP(sim,amount,key,reason) {
    const c=sim.character,r=c.rpg;if(c.hp<=0)return;if(!claim(c,'xp:'+key))return;
    const gained=Math.min(amount,500-r.xp);r.xp+=gained;sim.record('xp','获得经验',`${reason}：获得 ${gained} XP，累计 ${r.xp}。`,undefined,{amount:gained,source:key});
    while(r.combatLevel<5&&r.xp>=CURVE[r.combatLevel]){
      r.combatLevel++;const route=c.goal==='survive'||c.traits.caution>c.traits.courage?'生命':c.classId==='mage'?'技能':'命中';
      if(route==='生命')r.growth.hp+=3;else if(route==='命中')r.growth.attack++;else r.growth.skill++;
      apply(c);r.mp=Math.min(r.maxMp,r.mp+2);r.stamina=r.maxStamina;
      sim.record('levelup','实际升级',`战斗等级提升至 ${r.combatLevel}，选择${route}路线；最大HP ${c.maxHp}，攻击 +${c.attackBonus}。设定等级仍为 ${c.level}。`,undefined,{level:r.combatLevel,route,maxHp:c.maxHp,attack:c.attackBonus});
      autoEquip(sim);
    }
  }
  function utility(c,g) {
    const b=g.bonuses;return (b.attack||0)*10+(b.damage||0)*8+(b.ac||0)*(10+c.traits.caution/10)+(b.health||0)*2+(b.heal||0)*4+(b.focus||0)*(c.classId==='mage'?12:8);
  }
  function autoEquip(sim) {
    const c=sim.character,r=c.rpg;
    for(const slot of ['weapon','armor','trinket']){
      const current=item(r.equipment[slot]),choices=r.owned.map(item).filter(g=>g.slot===slot&&g.level<=r.combatLevel);
      choices.sort((a,b)=>utility(c,b)-utility(c,a));const chosen=choices[0];
      if(!chosen||chosen.id===current?.id||current&&utility(c,chosen)<=utility(c,current))continue;
      r.equipment[slot]=chosen.id;apply(c);
      sim.record('equip','自动换装',`装备「${chosen.name}」于${slot==='weapon'?'武器':slot==='armor'?'护甲':'饰品'}槽：职业匹配，效用 ${utility(c,chosen).toFixed(1)} 高于 ${current?utility(c,current).toFixed(1):0}；AC ${c.ac}，攻击 +${c.attackBonus}，伤害 1d${c.damageSides}+${c.damageBonus}。`,undefined,{item:chosen.id,slot,ac:c.ac,attack:c.attackBonus});
    }
  }
  function awardGear(sim,key,slot='armor') {
    const c=sim.character;if(!claim(c,'loot:'+key))return;
    const g=GEAR.find(g=>g.classId===c.classId&&g.slot===slot&&g.price>0);
    if(c.rpg.owned.includes(g.id))return;
    c.rpg.owned.push(g.id);sim.item({id:g.id,name:g.name,value:0});sim.record('gear','发现装备',`实际获得「${g.name}」，战斗等级 ${g.level} 可装备。`,undefined,{item:g.id,source:key});autoEquip(sim);
  }
  function maintenance(sim) {
    const c=sim.character,r=c.rpg,p=c.position;
    const atTown=p.region==='town'&&p.x===3&&p.y===16;
    const atRuin=sim.phase==='dungeon'&&sim.dungeon.explorer.known[p.y][p.x]===1&&p.x===sim.dungeon.start.x&&p.y===sim.dungeon.start.y;
    if((atTown||atRuin)&&sim.world.minutes-r.lastPrayer>=1440&&r.grace<80){
      r.lastPrayer=sim.world.minutes;r.grace=Math.min(100,r.grace+20);r.mp=Math.min(r.maxMp,r.mp+2);r.stamina=Math.min(r.maxStamina,r.stamina+2);
      const healed=Math.min(3,c.maxHp-c.hp);c.hp+=healed;sim.time(20,-3);sim.intention('在神龛前祈祷','已实际到达小镇或已发现的遗迹入口神龛，距上次祈祷至少一天。');
      sim.record('prayer','神龛祈祷',`向${PATRONS[c.classId].name}祈祷，神眷 +20（上限100），恢复 ${healed} HP、至多2点法力/体力；一天内不重复。`,undefined,{patron:PATRONS[c.classId].id,grace:r.grace,healed});return true;
    }
    if(!atTown||c.hp<c.maxHp*.8||c.fatigue>30)return false;
    const reserve=Math.max(6,(2-c.potions)*(sim.world.flags.merchantDiscount?6:8));
    const choices=GEAR.filter(g=>g.classId===c.classId&&g.price>0&&g.level<=r.combatLevel&&!r.owned.includes(g.id)&&c.gold>=(g.price-(sim.world.flags.merchantDiscount?2:0))+reserve);
    choices.sort((a,b)=>utility(c,b)-utility(c,a));const g=choices[0];if(!g)return false;
    const price=g.price-(sim.world.flags.merchantDiscount?2:0);c.gold-=price;r.owned.push(g.id);sim.item({id:g.id,name:g.name,value:0});sim.time(15);
    sim.record('gear','购买装备',`实际花费 ${price} 金币购买「${g.name}」；保留至少${reserve}金币作为药水/休息预算，已拥有物品不重复购买。`,undefined,{item:g.id,price});autoEquip(sim);return true;
  }
  function beginBattle(c) {c.rpg.battle={backstab:false,guard:0,ward:0,weaken:0,firstSpell:true,echo:0,miracle:false,blessing:false,escapeBlessing:false,counter:0};}
  function use(sim,name,cost,kind,reason) {
    const r=sim.character.rpg;r[kind]-=cost;r.skills[name]=(r.skills[name]||0)+1;sim.intention(name,reason);
    sim.record('skill',name,`${reason}；消耗 ${cost} ${kind==='mp'?'法力':'体力'}。`,undefined,{skill:name,cost,resource:kind});
  }
  function miracle(sim,name,reason) {
    const r=sim.character.rpg;r.grace-=35;r.miracles++;r.battle.miracle=true;sim.intention(name,reason);
    sim.record('miracle',name,`${PATRONS[sim.character.classId].name}回应：${reason}。消耗35神眷，本场不再重复。`,undefined,{patron:PATRONS[sim.character.classId].id,cost:35,reason});
  }
  function escapeBonus(sim) {
    const c=sim.character,r=c.rpg,b=r.battle;if(c.classId!=='rogue')return {bonus:0,automatic:false};
    let bonus=b.escapeBlessing?0:1;b.escapeBlessing=true;
    if(r.grace>=35&&!b.miracle){miracle(sim,'影步','生命/疲劳触发撤退，沿真实已知退路紧急脱离');return {bonus,automatic:true};}
    if(r.stamina>=2){use(sim,'灵巧脱离',2,'stamina','风险阈值已触发撤退，以体力换取脱离检定+4');bonus+=4;}
    return {bonus,automatic:false};
  }
  function combatChoice(sim) {
    const c=sim.character,r=c.rpg,b=r.battle,target=sim.combat.battle.target;
    if(c.classId==='warrior'&&r.grace>=50&&!b.miracle&&sim.combat.battle.round===1){miracle(sim,'不屈誓言','神眷充足，准备格挡4伤害并在敌人命中时反击3伤害');b.guard=4;b.counter=3;sim.time(1,.5);sim.combat.battle.turn='skeleton';return {consumed:true};}
    if(c.classId==='mage'&&r.mp<=r.maxMp*.75&&r.grace>=35&&!b.miracle){const restored=Math.min(5,r.maxMp-r.mp);r.mp+=restored;miracle(sim,'秘法回响','法力已消耗，实际恢复'+restored+'法力并强化下一法术3伤害');b.echo=3;sim.time(1,.5);sim.combat.battle.turn='skeleton';return {consumed:true};}
    if(c.classId==='warrior'&&(c.hp/c.maxHp<.58||sim.combat.battle.round===2&&target.hp>3&&c.traits.caution>=50)&&r.stamina>=2&&!b.guard){use(sim,'守护姿态',2,'stamina','生命偏低或预计承受下一轮攻击，减免敌人下一次攻击4伤害');b.guard=4;sim.time(1,.5);sim.combat.battle.turn='skeleton';return {consumed:true};}
    if(c.classId==='warrior'&&r.stamina>=2&&sim.combat.battle.round%2===1){use(sim,'盾击',2,'stamina','敌人仍有行动能力，命中后削弱下一次命中加值2');return {skill:'盾击'};}
    if(c.classId==='rogue'&&sim.combat.battle.round===1&&!b.backstab&&r.stamina>=2){use(sim,'背刺',2,'stamina','首次交锋抓住破绽，命中额外1d6伤害；本场一次');b.backstab=true;return {skill:'背刺'};}
    if(c.classId==='mage'){
      const frost=sim.combat.battle.round===1&&target.hp>6, cost=(frost?2:3)-(b.firstSpell?1:0);
      if(r.mp>=cost){const name=frost?'霜缚术':'奥术飞弹';use(sim,name,cost,'mp',frost?'初战削弱敌人下一次命中加值2，同时造成稳定伤害':'以有限法力换取稳定伤害，不进行攻击骰');b.firstSpell=false;return {skill:name};}
    }
    return {};
  }
  function resolveAttack(sim,choice,attacker,defender,random) {
    const c=sim.character,r=c.rpg,b=r.battle,hero=attacker===c,skill=hero?choice.skill:null;
    const actualBonus=attacker.attackBonus-(!hero?b.weaken:0),copy={...defender};
    let result,wardTriggered=false;
    if(skill==='霜缚术'||skill==='奥术飞弹'){
      const damage=(skill==='霜缚术'?2:3)+r.combatLevel+Math.floor(r.growth.skill/2)+bonuses(c).focus+b.echo;b.echo=0;
      result={roll:null,total:null,critical:false,hit:true,dice:[],damage,hp:Math.max(0,defender.hp-damage)};
    }else result=D.attack({...attacker,attackBonus:actualBonus},copy,random);
    if(skill==='背刺'&&result.hit){const extra=1+Math.floor(random()*6);result.damage+=extra;result.extra=extra;}
    if(hero&&result.hit&&['盾击','霜缚术'].includes(skill))b.weaken=2;
    if(!hero){
      b.weaken=0;let reduction=b.guard;if(result.hit)b.guard=0;
      if(result.hit&&c.classId==='warrior'&&c.hp/c.maxHp<.4&&!b.blessing){reduction+=2;b.blessing=true;}
      const incoming=result.damage;result.damage=Math.max(0,result.damage-reduction);result.reduced=incoming-result.damage;
      if(result.hit&&b.counter&&c.hp>result.damage){attacker.hp=Math.max(0,attacker.hp-b.counter);sim.record('counter','誓言反击',`格挡后实际反击 ${b.counter} 伤害，敌人HP ${attacker.hp}/${attacker.maxHp}。`,undefined,{damage:b.counter,hp:attacker.hp});b.counter=0;}
      if(c.classId==='warrior'&&result.hit&&result.damage>=c.hp&&r.grace>=35&&!b.miracle){result.damage=Math.max(0,c.hp-1);wardTriggered=true;}
    }
    defender.hp=Math.max(0,defender.hp-result.damage);result.hp=defender.hp;if(wardTriggered)miracle(sim,'不屈誓言','实际致死攻击被誓言抵挡，生命保留1HP');result.attackBonus=actualBonus;result.skill=skill;
    if(skill)result.description=`${skill}：${result.roll===null?'稳定法术，无攻击骰':`d20(${result.roll}) + ${actualBonus} / AC ${defender.ac}，${result.hit?'命中':'失手'}`}，实际造成 ${result.damage} 伤害${result.extra?`（背刺增加${result.extra}）`:''}，目标HP ${defender.hp}/${defender.maxHp}。`;
    return result;
  }
  function onFact(sim,type,facts,title) {
    const c=sim.character,r=c.rpg;
    if(type==='rest'){r.mp=r.maxMp;r.stamina=r.maxStamina;sim.record('restore','休息恢复技能资源',`法力 ${r.mp}/${r.maxMp}，体力 ${r.stamina}/${r.maxStamina}。`);}
    if(type==='victory'){gainXP(sim,16,'enemy:'+sim.phase+':'+facts.target+':'+c.kills,'击败实际敌人');if(c.classId==='warrior')favor(sim,10,'勇敢抗敌','kill:'+c.kills);}
    if(type==='escape'&&facts.success&&c.classId==='rogue')favor(sim,10,'机敏脱离','escape:'+sim.phase+':'+c.moves);
    if(type==='complete'){gainXP(sim,20,'ruins-complete','完成遗迹探索');favor(sim,12,'完成危险地区探索','ruins');}
    if(type==='quest-followup'&&['success','borrowed'].includes(facts.branch)){gainXP(sim,18,'quest:'+facts.quest,'委托实际结算');favor(sim,12,'完成重要委托','quest:'+facts.quest);awardGear(sim,'quest:'+facts.quest,'trinket');}
    if(type==='result'){
      const id=facts.eventId,action=facts.actionId,success=!facts.check||facts.check.success;
      if(success)gainXP(sim,8,'event:'+id,'成功处理事件');
      const kindness=['help','potion','guide','return','share'].includes(action),study=['study','read','search','collect','inspect'].includes(action);
      if(c.classId==='warrior'&&kindness)favor(sim,8,'保护与帮助他人',id);
      if(c.classId==='rogue'&&study)favor(sim,8,'发现秘密与调查',id);
      if(c.classId==='mage'&&study)favor(sim,8,'研究未知知识',id);
      if(c.classId==='warrior'&&action==='take'||c.classId==='rogue'&&id==='peddler'&&action==='buy'||c.classId==='mage'&&['stele','altar'].includes(id)&&action==='leave')favor(sim,-6,'行动违背信条',id);
      const looted = id==='hidden_room'&&action==='search'||['ancient_cache','cursed_chest'].includes(id)&&action==='open';
      if(success&&looted)awardGear(sim,'chest:'+id,'armor');
    }
  }
  function valid(c) {
    const r=c.rpg;if(!r)return true;
    const num=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
    const structural = r.version===1&&num(r.combatLevel,1,5)&&num(r.xp,0,500)&&num(r.grace,0,100)&&num(r.miracles,0,10000)&&num(r.mp,0,r.maxMp)&&num(r.maxMp,0,30)&&num(r.stamina,0,r.maxStamina)&&num(r.maxStamina,0,30)&&Number.isFinite(r.lastPrayer)&&r.lastPrayer>=-1440&&
      r.base&&baseKeys.every(k=>Number.isFinite(r.base[k])&&r.base[k]>=0&&r.base[k]<=100)&&r.growth&&['hp','attack','skill'].every(k=>num(r.growth[k],0,20))&&
      Array.isArray(r.owned)&&r.owned.length<=GEAR.length&&new Set(r.owned).size===r.owned.length&&r.owned.every(id=>item(id)?.classId===c.classId)&&r.equipment&&Object.keys(r.equipment).every(k=>['weapon','armor','trinket'].includes(k))&&['weapon','armor','trinket'].every(slot=>r.equipment[slot]===null||r.owned.includes(r.equipment[slot])&&item(r.equipment[slot]).slot===slot&&item(r.equipment[slot]).level<=r.combatLevel)&&
      r.sources&&Object.keys(r.sources).length<=500&&Object.values(r.sources).every(v=>v===true)&&r.skills&&Object.entries(r.skills).every(([key,v])=>SKILLS[c.classId].includes(key)&&num(v,0,10000))&&
      (!r.battle||['guard','ward','weaken','echo','counter'].every(k=>num(r.battle[k],0,10))&&['backstab','firstSpell','miracle','blessing','escapeBlessing'].every(k=>typeof r.battle[k]==='boolean'));
    if(!structural||r.growth.hp/3+r.growth.attack+r.growth.skill!==r.combatLevel-1||r.combatLevel!==CURVE.filter(x=>r.xp>=x).length)return false;
    const copy=JSON.parse(JSON.stringify(c));apply(copy);return baseKeys.every(k=>copy[k]===c[k])&&copy.rpg.maxMp===r.maxMp&&copy.rpg.maxStamina===r.maxStamina;

  }
  const api={PATRONS,GEAR,SKILLS,CURVE,install,apply,bonuses,item,beginBattle,maintenance,combatChoice,resolveAttack,escapeBonus,gainXP,favor,awardGear,onFact,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FateRules=api;
})(globalThis);
