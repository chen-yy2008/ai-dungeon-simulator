/* 鸦羽 is a read-only template view of facts, never a decision or reward engine. */
(function(root){
  'use strict';
  const F=typeof module!=='undefined'&&module.exports?require('./progression.js'):root.FateRules;
  const openings={
    departure:['灯火渐远，旅程已在脚下展开。','离开安全的屋檐，是这段记录的新一页。',"路向前延伸，骰子仍不接受史官的代签。","边境很大，先走好已经知道的这一段。"],
    oracle:['誓言已经得到一次实际回应。','信仰写在行动里，也写在付出的代价里。',"神明有了实际回应，我的账本也记下了代价。","神迹不是免费午餐；这一次，消耗与结果都有记录。"],
    battle:['交锋已经开始，结果仍须由规则判定。','我会记录每一次挥击，但不会替冒险者改写骰点。',"战斗已经发生。我有羽毛，却没有修改骰点的权力。","先看实际命中与伤害，英雄的名声稍后再算。"],
    growth:['这一次成长，来自已经走过的路。','人物卡上的变化，有真实经历作证。',"成长终于落在数字上，这可比豪言壮语可靠。","新的数值已经生效，旧伤与旧路并未白走。"],
    npc:['一次回应留下了记忆。','居民记得实际的选择，而非空许的承诺。',"信任不是花纹，实际待遇会记住这次变化。","这次互动已落笔，关系的账也确实变了。"],
    danger:['生命曾逼近危险边缘。','这一刻值得留在传记中，伤势已经实际发生。',"这一笔写得很轻，伤害数字却一点也不轻。","险境已经发生。先承认伤势，才有机会谈下一步。"],
    choice:['决定已落地，后果会在世界里留下痕迹。','此刻记录的是已作出的选择，未来仍未发生。',"决定已经落地，我只负责把因果写清。","这不是一页预言；选择是真的，后续还要等它发生。"],
    completion:['这件事到了结算后果的时候。','这一页的回访有此前的行动作证。',"此前的行动终于有了可以核对的后果。","回访完成。报酬、关系和代价，一个也不替角色编。"],
    ending:['这一段旅程已有真实的收束。','故事的结尾来自走过的每一步。',"故事收束了。我的墨水不会把失败偷偷擦掉。","这一局已经有了真实结尾，另一种性格或许会走另一条路。"]
  };
  function category(r){
    if(['birth','declaration','region'].includes(r.type))return 'departure';
    if(['prayer','miracle'].includes(r.type))return 'oracle';
    if(r.type==='battle')return 'battle';
    if(['levelup','equip'].includes(r.type))return 'growth';
    if(['quest','aid','refusal','relationship'].includes(r.type))return 'npc';
    if(r.type==='attack'&&r.facts?.turn==='skeleton'&&r.facts.hp>0&&r.facts.hp<=8)return 'danger';
    if(r.type==='saga')return r.facts.stage==='complete'?'completion':'choice';
    if(r.type==='quest-followup')return 'completion';
    if(['death','ending'].includes(r.type))return 'ending';
    return null;
  }
  function describe(r,c,mode='full'){
    if(mode==='off')return '';
    const key=category(r);if(!key)return mode==='brief'?r.text:r.story;
    if(mode==='brief')return '鸦羽 · '+r.title+'：'+r.text;
    const className={warrior:'战士',rogue:'游荡者',mage:'法师'}[c.classId];
    const patron=F.PATRONS[c.classId].name;
    const tone=c.traits.caution>=75?'谨慎倾向仍在，但已发生的结果无法撤销。':c.traits.greed>=75?'财富倾向会进入选择；这次收支仍以事实为准。':c.traits.curiosity>=80?'好奇心会引人前行，知识仍须一步步取得。':'性格会影响决定，结算仍交给规则。';
    const context=['oracle','growth','ending'].includes(key)?className+' / '+patron+'。'+tone+' ':'';
    return '鸦羽 · '+c.name+'的纪行：'+openings[key][(r.id+c.classId.length)%openings[key].length]+' '+context+r.text;
  }
  const date=t=>`第${Math.floor(t/1440)+1}天 ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  function biography(sim){
    const c=sim.character,s=sim.world.saga,events=s?.milestones||[];
    const chapters=[['出身与信仰',events.filter(r=>r.type==='birth'||r.type==='declaration'||r.type==='prayer')],['初次启程',events.filter(r=>r.type==='region')],['重要伙伴',events.filter(r=>['quest','quest-followup','aid','refusal'].includes(r.type))],['最大困境',events.filter(r=>['battle','attack','death'].includes(r.type))],['决定命运的选择',events.filter(r=>r.type==='saga'||r.type==='miracle'||r.type==='levelup')],['结局',events.filter(r=>r.type==='ending')]];
    const lines=[`# ${c.name}的艾尔文边境传记`,`${F.PATRONS[c.classId].name}庇护 · 战斗等级${c.rpg.combatLevel} · ${s?.ending?.title||'仍在旅途'}`,`角色背景设定：${c.profile.identity}。${c.profile.background}`,`种子 ${sim.config.seed}（不同版本可能产生不同结果）`];
    for(const [title,records] of chapters){if(!records.length)continue;lines.push('','## '+title,...records.map(r=>`- [事实#${r.id} · ${date(r.time)}] ${r.text}`));}
    lines.push('','## 当前真实战绩',`移动${c.moves}步，击败${c.kills}名敌人，神迹${c.rpg.miracles}次，HP ${c.hp}/${c.maxHp}，金币${c.gold}。`,...Object.values(sim.world.npcs).map(n=>`${n.name}：关系${n.relationship}（${n.relationship>=10?'信赖':n.relationship<=-10?'冷淡':'普通'}）。`));
    return lines.join('\n');
  }
  const api={openings,category,describe,biography,date};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Chronicler=api;
})(globalThis);
