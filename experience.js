/* Public presets and a read-only share report. No storage/account/URL save data. */
(function(root){
 'use strict';
 const N=typeof module!=='undefined'&&module.exports?require('./narrative.js'):root.Chronicler;
 const F=typeof module!=='undefined'&&module.exports?require('./progression.js'):root.FateRules;
 const PRESETS=[
  {id:'oath',name:'伊芙·誓灯',classId:'warrior',goal:'explore',seed:'saga-1',traits:{kindness:100,courage:70,greed:0,caution:40,curiosity:90},identity:'边境守灯人',background:'她把守护路人的誓言带到边境，能否践行仍由本次冒险决定。',values:['责任','同情'],description:'愿意承担风险的守护者。善良与勇气共同影响选择。'},
  {id:'night',name:'洛恩·夜途',classId:'rogue',goal:'wealth',seed:'saga-1',traits:{kindness:5,courage:65,greed:100,caution:60,curiosity:80},identity:'夜路寻宝者',background:'他相信财富能换来自由；背包还空着，所有战利品都要亲自取得。',values:['财富','自由'],description:'精打细算的逐利者。秘密、退路和眼前利益都很重要。'},
  {id:'star',name:'瑟拉·织星',classId:'mage',goal:'explore',seed:'world-browser-003',traits:{kindness:60,courage:60,greed:25,caution:45,curiosity:95},identity:'初来边境的学徒',background:'她循着古老碑文的传闻而来；尚未获得遗迹中的任何知识。',values:['知识','探索'],description:'好奇而节制的学徒。以有限法力追索星辉法阵的秘密。'}
 ];
 function summary(sim){
  const c=sim.character,s=sim.world.saga;
  const choices=s.milestones.filter(r=>r.type==='saga'&&['caravan-action','stars-action','letter-consequence'].includes(r.facts?.event)).map(r=>`- [事实#${r.id}] ${r.text}`);
  return [`# 艾尔文边境 · ${c.name}的战报`,`AI Dungeon Simulator v1.0.0 · ${s.ending?.title||'旅途中'}`,`${F.PATRONS[c.classId].name} · 战斗等级${c.rpg.combatLevel} · ${N.date(sim.world.minutes)}`,`移动${c.moves}步 / 击杀${c.kills} / 神迹${c.rpg.miracles}次 / HP ${c.hp}/${c.maxHp}`,`装备：${Object.values(c.rpg.equipment).filter(Boolean).map(id=>F.item(id).name).join('、')}`,`技能：${Object.entries(c.rpg.skills).map(([name,n])=>name+' '+n+'次').join('、')||'尚未使用'}`,...choices,`种子：${sim.config.seed}（不同版本结果可能变化）`,'打开即玩：https://chen-yy2008.github.io/ai-dungeon-simulator/','角色按规则自主行动；战报仅来自本次真实事件。'].join('\n');
 }
 const api={PRESETS,summary,biography:N.biography};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdventureExperience=api;
})(globalThis);
