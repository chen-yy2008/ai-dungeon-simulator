/* Finite causal campaign. Only Simulation calls actions; rendering never executes rules. */
(function(root){
  'use strict';
  const L=typeof module!=='undefined'&&module.exports?require('./living-world.js'):root.LivingWorld;
  const F=typeof module!=='undefined'&&module.exports?require('./progression.js'):root.FateRules;
  const TOWN={x:3,y:16},RUINS={x:17,y:4};
  const STONES=[{x:6,y:13},{x:11,y:7},{x:16,y:6}];
  const TITLES={caravan:'失踪商队与黑森林契约',stars:'遗迹中的星辉法阵',letter:'旅馆的最后一封信'};
  const BRANCH_NAMES={rescued:'协助救出商队',ransom:'付费换得通行',failed:'现场行动失败',sold:'选择牟利',abandoned:'放弃追踪',declined:'婉拒原委托',sealed:'封印法阵',purified:'净化法阵',taken:'带走能量',returned:'归还书信',hidden:'保留秘密',ignored:'婉拒寻信'};
  const ENDINGS={fallen:'陨落的冒险者',guardian:'边境守护者',seeker:'秘法追寻者',profiteer:'逐利旅人',survivor:'幸存者'};
  const at=(a,b)=>a.x===b.x&&a.y===b.y;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function install(w){
    if(w.saga)return;
    w.saga={version:1,caravan:{stage:'dormant',branch:null,due:0},stars:{stage:'dormant',branch:null,due:0,clues:[]},letter:{stage:'dormant',branch:null,due:0},milestones:[],indexed:{},aid:{},ending:null};
  }
  function fact(sim,line,title,text,extra={}){
    sim.record('saga',title,text,undefined,{line,stage:sim.world.saga[line].stage,...extra});
    const previous=sim.character.memories.find(m=>m.id==='saga-'+line);if(previous)previous.note=text;
    sim.remember('saga-'+line,text);
  }
  function choose(sim,choices){
    const c=sim.character,t=c.traits;
    const items=choices.map(o=>({...o,score:20+Object.entries(o.traits||{}).reduce((v,[k,w])=>v+t[k]*w,0)+(o.goal===c.goal?12:0)+(o.values||[]).filter(v=>c.profile.values.includes(v)).length*8+(o.patron===c.classId?8:0)}));
    const result=sim.agent.choose(items,()=>sim.random.next());
    sim.intention(result.label,`结合性格、价值观、${F.PATRONS[c.classId].name}与实际资源评分（${result.score.toFixed(1)}），自主选择${result.label}。`);
    return result;
  }
  function relation(sim,id,text,n){L.memory(sim,id,text,n);}
  function onFact(sim,type,facts){
    const w=sim.world,s=w.saga;if(!s)return;
    if(type==='quest'&&facts.quest==='caravan'&&s.caravan.stage==='dormant'){
      s.caravan.stage=facts.action==='accept'?'track':'followup';s.caravan.branch=facts.action==='accept'?null:'declined';s.caravan.due=w.quests.caravan.due;
    }
    if(type==='quest-check'&&facts.quest==='caravan'&&['dormant','track'].includes(s.caravan.stage)){
      s.caravan.stage='choice';s.caravan.due=w.minutes+120;
      fact(sim,'caravan','商队的新线索',`调查留下了另一处营地的位置：森林(5,8)。需稍后实际前往；此前货物调查${facts.success?'成功':'失败'}不代表商队已经获救。`,{event:'caravan-clue',success:facts.success});
    }
    const r=w.history[w.history.length-1];
    const once=['birth','battle','levelup','prayer','region','attack','skill','miracle'].includes(type);
    let key=type;
    if(type==='region')key+=':'+r.title;
    if(type==='skill')key+=':'+facts.skill;
    if(type==='attack'&&!(facts.turn==='skeleton'&&sim.character.hp>0&&sim.character.hp<=sim.character.maxHp*.25))return;
    if(once&&s.indexed[key])return;
    if(!['birth','battle','levelup','prayer','region','attack','skill','miracle','saga','quest','quest-followup','death','ending','aid','refusal'].includes(type))return;
    if(once)s.indexed[key]=true;
    if(s.milestones.length<160)s.milestones.push({id:r.id,time:r.time,type:r.type,title:r.title,text:r.text,facts:JSON.parse(JSON.stringify(r.facts))});
  }
  function aid(sim){
    const c=sim.character,s=sim.world.saga;if(c.hp<=0||c.hp/c.maxHp>=.4)return false;
    for(const id of ['innkeeper','guild','merchant','mage']){
      const n=sim.world.npcs[id];if(!L.present(sim,id)||s.aid[id])continue;
      s.aid[id]=true;
      if(n.relationship>=10){const healed=Math.min(8,c.maxHp-c.hp);c.hp+=healed;sim.time(15);sim.record('aid','危机援助',`在场的${n.name}因信任提供照料，实际恢复${healed}HP；本次冒险不再重复。`,undefined,{npc:id,healed});return true;}
      if(n.relationship<=-10){sim.time(5);sim.record('refusal','援助被拒绝',`在场的${n.name}因此前关系${n.relationship}拒绝额外援助；免费铺位仍开放。`,undefined,{npc:id});return true;}
    }
    return false;
  }
  function tryTown(sim){
    const c=sim.character,w=sim.world,s=w.saga;
    if(!at(c.position,TOWN)||c.position.region!=='town')return false;
    if(aid(sim))return true;
    if(s.caravan.stage==='dormant'&&w.quests.caravan.stage==='complete'&&L.present(sim,'guild')){
      const old=w.quests.caravan.branch;s.caravan.stage=old==='declined'?'followup':'choice';s.caravan.branch=old==='declined'?'declined':null;s.caravan.due=w.minutes+120;sim.time(15);fact(sim,'caravan','旧委托的新回访','在场的奥林根据已经结算的商队委托，指出森林(5,8)的营地；这是本次回访新增线索，不提前结算救援。',{event:'caravan-legacy-clue',npc:'guild'});return true;
    }
    if(s.letter.stage==='dormant'&&L.present(sim,'innkeeper')){
      s.letter.stage='offer';sim.time(10);fact(sim,'letter','米菈的请求','在场的米菈提到一位失踪旅人最后停留的林地(11,7)，请冒险者寻找一封未送达的信。',{event:'letter-clue',npc:'innkeeper'});return true;
    }
    if(s.letter.stage==='offer'&&L.present(sim,'innkeeper')){
      const o=choose(sim,[{action:'help',label:'寻找最后一封信',traits:{kindness:.5,curiosity:.3},values:['责任','同情']},{action:'ignore',label:'婉拒寻信',traits:{caution:.45,greed:.2},goal:'survive'}]);
      s.letter.stage=o.action==='help'?'search':'followup';s.letter.branch=o.action==='help'?null:'ignored';s.letter.due=w.minutes+180;sim.time(10);fact(sim,'letter','回应寻信请求',`角色选择「${o.label}」。${o.action==='help'?'需要实际前往林地。':'保存婉拒，之后回访才结算关系。'}`,{event:'letter-choice',action:o.action});return true;
    }
    if(s.stars.stage==='dormant'&&c.knowledge.includes('ruins')&&L.present(sim,'mage')){
      s.stars.stage='clues';sim.time(15);fact(sim,'stars','薇娅的星图','在场的薇娅标出三处公开路旁线索碑：(6,13)、(11,7)、(16,6)。须逐处到达调查，再进入遗迹入口的法阵。',{event:'stars-clue',npc:'mage'});return true;
    }
    for(const line of ['letter','caravan','stars']){
      const q=s[line];if(q.stage!=='followup'||w.minutes<q.due)continue;
      const npc=line==='letter'?'innkeeper':line==='stars'?'mage':L.present(sim,'merchant')?'merchant':'guild';
      if(!L.present(sim,npc))continue;
      if(line==='letter'&&q.branch===null){
        if(!c.inventory.some(i=>i.id==='lastLetter'))throw Error('Actual letter required');
        const o=choose(sim,[{action:'return',label:'归还最后一封信',traits:{kindness:.65,courage:.1},values:['责任','同情']},{action:'hide',label:'保留信中秘密',traits:{caution:.55,curiosity:.25},values:['自由']},{action:'sell',label:'以秘密换取酬金',traits:{greed:.85},goal:'wealth'}]);
        q.branch=o.action==='return'?'returned':o.action==='hide'?'hidden':'sold';c.inventory=c.inventory.filter(i=>i.id!=='lastLetter');
        if(q.branch==='sold')c.gold+=12;
      }
      let delta=0;
      if(line==='letter'){delta=q.branch==='returned'?18:q.branch==='ignored'?-3:-15;w.flags.lodgingTrust=q.branch==='returned';}
      if(line==='caravan'){const safe=['rescued','ransom'].includes(q.branch);delta=safe?16:q.branch==='sold'?-18:-5;w.flags.caravanMarket=safe?'safe':q.branch==='sold'?'exploited':'unresolved';w.flags.roadSafety=safe;if(safe)c.gold+=10;}
      if(line==='stars'){delta=q.branch==='taken'?-16:q.branch==='failed'?-3:16;w.flags.starOutcome=q.branch;if(q.branch==='purified')F.favor(sim,12,'净化法阵后的研究回访','stars-followup');}
      relation(sim,npc,TITLES[line]+'：'+q.branch,delta);sim.time(20);q.stage='complete';q.completedAt=w.minutes;
      fact(sim,line,'主线后果 · '+TITLES[line],`实际回访在场的${w.npcs[npc].name}，结算此前选择「${BRANCH_NAMES[q.branch]}」，关系${delta>=0?'+':''}${delta}。${line==='caravan'?w.flags.roadSafety?'道路安全、药水市场降价，收到10金币。':'商路未获安全保障，市场不提供救援优惠。':line==='letter'?q.branch==='returned'?'米菈愿意提供住宿优惠。':q.branch==='sold'?'已以秘密换取12金币，米菈不再提供信任优惠。':'旅馆保持普通条件。':'法阵结果已写入世界，薇娅据此改变关系。'}`,{event:line+'-consequence',branch:q.branch,npc,relationship:w.npcs[npc].relationship});return true;
    }
    return false;
  }
  function tryForest(sim){
    const c=sim.character,w=sim.world,s=w.saga,p=c.position;
    if(p.region!=='forest')return false;
    if(aid(sim))return true;
    if(s.letter.stage==='search'&&at(p,STONES[1])){
      sim.item({id:'lastLetter',name:'未送达的信',value:0});sim.time(20,2);s.letter.stage='followup';s.letter.due=w.minutes+180;
      fact(sim,'letter','找到了未送达的信','实际到达林地(11,7)，从旧路标下取到一封信，放入背包；至少180分钟后回旅馆决定交付方式。',{event:'letter-found',item:'lastLetter'});return true;
    }
    const stone=STONES.findIndex(p0=>at(p,p0));
    if(s.stars.stage==='clues'&&stone>=0&&!s.stars.clues.includes(stone)){
      s.stars.clues.push(stone);sim.time(20,2);if(s.stars.clues.length===3)s.stars.stage='ritual';
      fact(sim,'stars','调查星辉线索碑',`在森林(${p.x},${p.y})实际调查第${stone+1}处线索碑，已记录${s.stars.clues.length}/3。${s.stars.clues.length===3?'三碑已齐，需到遗迹内已发现的入口法阵。':'尚未取得其他碑文，不提前输出仪式结果。'}`,{event:'stars-stone',stone});return true;
    }
    if(s.caravan.stage==='choice'&&at(p,{x:5,y:8})&&w.minutes>=s.caravan.due){
      const o=choose(sim,[{action:'rescue',label:'协助解救商队',traits:{kindness:.55,courage:.25},values:['责任','同情'],patron:'warrior'},{action:'ransom',label:'支付8金币换取通行',traits:{caution:.6,kindness:.25},allowed:c.gold>=8},{action:'sell',label:'优先取走营地钱匣',traits:{greed:.85},goal:'wealth'},{action:'abandon',label:'放弃追查商队',traits:{caution:.6},goal:'survive'}]);
      let result='';
      if(o.action==='rescue'){const roll=sim.random.integer(1,20),success=roll+c.exploreBonus>=10;s.caravan.branch=success?'rescued':'failed';if(!success)c.hp=Math.max(0,c.hp-3);result=`调查d20(${roll})+${c.exploreBonus}/DC10，${success?'引导商队脱困':'营地追踪失败，实际受伤3HP'}。`;}
      if(o.action==='ransom'){c.gold-=8;s.caravan.branch='ransom';result='实际支付8金币，换得商队通行。';}
      if(o.action==='sell'){c.gold+=12;s.caravan.branch='sold';result='实际获得12金币，收走营地遗落钱匣，放弃救援；商路仍不安全。';}
      if(o.action==='abandon'){s.caravan.branch='abandoned';result='未支付或获得报酬，结束现场追查。';}
      sim.time(30,4);s.caravan.stage='followup';s.caravan.due=w.minutes+240;
      fact(sim,'caravan','黑森林营地抉择',`实际到达旧线索指定营地，选择「${o.label}」。${result}至少240分钟后向在场商人或公会回访。`,{event:'caravan-action',action:o.action,branch:s.caravan.branch});return true;
    }
    return false;
  }
  function tryDungeon(sim){
    const c=sim.character,w=sim.world,s=w.saga,q=s.stars,d=sim.dungeon;
    if(c.hp/c.maxHp<=sim.agent.threshold(c)||c.fatigue>=80)return false;
    if(q.stage!=='ritual'||!at(c.position,d.start)||d.explorer.known[c.position.y][c.position.x]!==1||d.retreating)return false;
    const o=choose(sim,[{action:'seal',label:'封印星辉法阵',traits:{caution:.55,kindness:.2},values:['责任']},{action:'purify',label:'净化星辉法阵',traits:{curiosity:.4,kindness:.4},patron:'mage',values:['知识'],allowed:c.potions>0||c.rpg.mp>=2},{action:'take',label:'带走法阵能量',traits:{greed:.85,courage:.1},goal:'wealth'}]);
    let detail='';
    if(o.action==='purify'){
      const resource=c.rpg.mp>=2?'2MP':'1瓶药水';
      if(c.rpg.mp>=2)c.rpg.mp-=2;else c.potions--;
      const cooperation=w.npcs.mage.relationship>=10?2:0,roll=sim.random.integer(1,20),success=roll+c.exploreBonus+cooperation>=10;
      q.branch=success?'purified':'failed';if(!success)c.hp=Math.max(0,c.hp-4);
      detail=`消耗${resource}；d20(${roll})+${c.exploreBonus}+合作${cooperation}/DC10，${success?'净化成功':'净化失败，受到4伤害'}。`;
    }else if(o.action==='take'){q.branch='taken';c.gold+=14;c.hp=Math.max(0,c.hp-3);detail='能量转化为14金币，但反噬实际造成3伤害。';}
    else {q.branch='sealed';F.favor(sim,10,'谨慎封印已调查法阵','stars-seal');detail='法阵被封存，获得10神眷（受上限限制），没有创造额外装备。';}
    sim.time(30,4);q.stage='followup';q.due=w.minutes+360;
    fact(sim,'stars','法阵的真实抉择',`带着三碑记录来到已发现的遗迹入口法阵，选择「${o.label}」。${detail}至少360分钟后须与在场的薇娅回访。`,{event:'stars-action',action:o.action,branch:q.branch});return true;
  }
  function target(sim){
    const c=sim.character,w=sim.world,s=w.saga;
    if(!sim.config.endless&&(sim.actions>=1500||Object.values(TITLES).length===3&&['caravan','stars','letter'].every(k=>s[k].stage==='complete'))){return {action:'return',target:TOWN,reason:'本轮冒险已到收束时刻，沿真实道路回镇整理传记；未完成主线如实保留。'};}
    if(s.caravan.stage==='choice')return {action:'forest',target:{x:5,y:8},reason:'追踪已有商队委托留下的营地线索。'};
    if(s.stars.stage==='clues'&&w.npcs.mage.relationship>=10){const p=STONES.find((_,i)=>!s.stars.clues.includes(i));return {action:'forest',target:p,reason:'薇娅的信任使星图情报获得优先处理；实际三碑调查仍必需。'};}
    if(s.letter.stage==='search')return {action:'forest',target:STONES[1],reason:'前往米菈指出的已知道路寻找未送达的信。'};
    if(s.stars.stage==='clues'){
      const p=STONES.find((_,i)=>!s.stars.clues.includes(i));return {action:'forest',target:p,reason:'逐处调查薇娅提供的公开路旁线索碑，不读取地牢未知信息。'};
    }
    if(s.stars.stage==='ritual'&&w.minutes>=w.ruinCooldown)return {action:'ruins',target:RUINS,reason:'三处实际碑文已齐，前往遗迹入口法阵；低HP/疲劳仍优先撤退。'};
    if(['caravan','stars','letter'].some(k=>s[k].stage==='followup'&&w.minutes>=s[k].due))return {action:'return',target:TOWN,reason:'此前实际行动的回访时间已到，回镇等候在场的相关居民。'};
    return null;
  }
  function endingCode(sim){
    const s=sim.world.saga;if(sim.character.hp===0)return 'fallen';
    if(['rescued','ransom'].includes(s.caravan.branch)&&s.letter.branch==='returned'&&['sealed','purified'].includes(s.stars.branch))return 'guardian';
    if(s.stars.branch==='purified')return 'seeker';
    if(s.caravan.branch==='sold'||s.letter.branch==='sold'||s.stars.branch==='taken')return 'profiteer';
    return 'survivor';
  }
  function finish(sim){
    const s=sim.world.saga;if(s.ending)return;
    const code=endingCode(sim);s.ending={code,title:ENDINGS[code],time:sim.world.minutes,actions:sim.actions};
    if(code!=='fallen')sim.status='complete';
    sim.record('ending','边境纪行 · '+ENDINGS[code],`${sim.character.name}的阶段冒险${code==='fallen'?'因死亡终止':'在实际回到小镇后收束'}。称号「${ENDINGS[code]}」由真实选择与存活状态决定；未完成主线不视为成功。`,undefined,{code});
    sim.intention(ENDINGS[code],'本次阶段冒险已结束，可查看关键事实与传记，或新建另一位冒险者。');
  }
  function afterStep(sim){
    const s=sim.world.saga;
    if(sim.character.hp===0){finish(sim);return;}
    if(sim.config.endless||s.ending)return;
    const ready=sim.actions>=650&&['caravan','stars','letter'].every(k=>s[k].stage==='complete');
    if((ready||sim.actions>=1500)&&sim.phase==='world'&&at(sim.character.position,TOWN)&&!sim.pending&&!sim.combat?.battle){finish(sim);return;}
    if(sim.actions>=1500&&sim.phase==='dungeon'){sim.dungeon.retreating=true;sim.dungeon.explorer.path=[];}
  }
  function valid(w){
    const s=w.saga;if(!s)return true;
    const branches={caravan:['rescued','ransom','failed','sold','abandoned','declined'],stars:['sealed','purified','taken','failed'],letter:['returned','hidden','sold','ignored']};
    const stages={caravan:['dormant','track','choice','followup','complete'],stars:['dormant','clues','ritual','followup','complete'],letter:['dormant','offer','search','followup','complete']};
    if(s.version!==1||!s.indexed||Object.values(s.indexed).some(v=>v!==true)||!s.aid||Object.entries(s.aid).some(([k,v])=>!['innkeeper','guild','merchant','mage'].includes(k)||v!==true)||!Array.isArray(s.milestones)||s.milestones.length>160)return false;
    if(!Object.entries(branches).every(([k,b])=>s[k]&&stages[k].includes(s[k].stage)&&(s[k].branch===null||b.includes(s[k].branch))&&Number.isInteger(s[k].due)&&s[k].due>=0))return false;
    if(!Array.isArray(s.stars.clues)||new Set(s.stars.clues).size!==s.stars.clues.length||s.stars.clues.some(x=>![0,1,2].includes(x)))return false;
    if(['ritual','followup','complete'].includes(s.stars.stage)&&s.stars.clues.length!==3)return false;
    if(!s.milestones.every((r,i)=>Number.isInteger(r.id)&&r.id>0&&r.id<=w.recordId&&Number.isInteger(r.time)&&r.time<=w.minutes&&typeof r.text==='string'&&r.text.length<4000&&typeof r.type==='string'&&typeof r.title==='string'&&r.facts&&(!w.history.find(h=>h.id===r.id)||w.history.find(h=>h.id===r.id).text===r.text)&&(!i||r.id>s.milestones[i-1].id)))return false;
    return !s.ending||Object.keys(ENDINGS).includes(s.ending.code)&&s.ending.title===ENDINGS[s.ending.code]&&Number.isInteger(s.ending.time)&&s.ending.time<=w.minutes;
  }
  const api={TITLES,ENDINGS,BRANCH_NAMES,STONES,install,onFact,tryTown,tryForest,tryDungeon,target,afterStep,endingCode,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SagaRules=api;
})(globalThis);
