/* 鸦羽 is a read-only template view of facts, never a decision or reward engine. */
(function(root){
  'use strict';
  const F=typeof module!=='undefined'&&module.exports?require('./progression.js'):root.FateRules;
  const openings={
    departure:['灯火渐远，旅程已在脚下展开。','离开安全的屋檐，是这段记录的新一页。'],
    oracle:['誓言已经得到一次实际回应。','信仰写在行动里，也写在付出的代价里。'],
    battle:['交锋已经开始，结果仍须由规则判定。','我会记录每一次挥击，但不会替冒险者改写骰点。'],
    growth:['这一次成长，来自已经走过的路。','人物卡上的变化，有真实经历作证。'],
    npc:['一次回应留下了记忆。','居民记得实际的选择，而非空许的承诺。'],
    danger:['生命曾逼近危险边缘。','这一刻值得留在传记中，伤势已经实际发生。'],
    choice:['决定已落地，后果会在世界里留下痕迹。','此刻记录的是已作出的选择，未来仍未发生。'],
    completion:['这件事到了结算后果的时候。','这一页的回访有此前的行动作证。'],
    ending:['这一段旅程已有真实的收束。','故事的结尾来自走过的每一步。']
  };
  function category(r){
    if(r.type==='region')return 'departure';
    if(['prayer','miracle'].includes(r.type))return 'oracle';
    if(r.type==='battle')return 'battle';
    if(['levelup','equip'].includes(r.type))return 'growth';
    if(['quest','aid','refusal'].includes(r.type))return 'npc';
    if(r.type==='attack'&&r.facts?.turn==='skeleton'&&r.facts.hp>0&&r.facts.hp<=8)return 'danger';
    if(r.type==='saga')return r.facts.stage==='complete'?'completion':'choice';
    if(r.type==='quest-followup')return 'completion';
    if(['death','ending'].includes(r.type))return 'ending';
    return null;
  }
  function describe(r,c){const key=category(r);return key?`鸦羽 · ${c.name}的纪行：${openings[key][r.id%openings[key].length]} ${r.text}`:r.story;}
  const date=t=>`第${Math.floor(t/1440)+1}天 ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  function biography(sim){
    const c=sim.character,s=sim.world.saga,events=s?.milestones||[];
    const chapters=[['出身与信仰',events.filter(r=>r.type==='birth'||r.type==='prayer')],['初次启程',events.filter(r=>r.type==='region')],['重要伙伴',events.filter(r=>['quest','quest-followup','aid','refusal'].includes(r.type))],['最大困境',events.filter(r=>['battle','attack','death'].includes(r.type))],['决定命运的选择',events.filter(r=>r.type==='saga'||r.type==='miracle'||r.type==='levelup')],['结局',events.filter(r=>r.type==='ending')]];
    const lines=[`# ${c.name}的艾尔文边境传记`,`${F.PATRONS[c.classId].name}庇护 · 战斗等级${c.rpg.combatLevel} · ${s?.ending?.title||'仍在旅途'}`,`角色背景设定：${c.profile.identity}。${c.profile.background}`,`种子 ${sim.config.seed}（不同版本可能产生不同结果）`];
    for(const [title,records] of chapters){if(!records.length)continue;lines.push('','## '+title,...records.map(r=>`- [事实#${r.id} · ${date(r.time)}] ${r.text}`));}
    lines.push('','## 当前真实战绩',`移动${c.moves}步，击败${c.kills}名敌人，神迹${c.rpg.miracles}次，HP ${c.hp}/${c.maxHp}，金币${c.gold}。`,...Object.values(sim.world.npcs).map(n=>`${n.name}：关系${n.relationship}（${n.relationship>=10?'信赖':n.relationship<=-10?'冷淡':'普通'}）。`));
    return lines.join('\n');
  }
  const api={openings,category,describe,biography,date};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Chronicler=api;
})(globalThis);
