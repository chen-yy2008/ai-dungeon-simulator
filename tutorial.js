/* Independent, optional guide state. No world writes, rewards or extra simulation loop. */
(function(root){
 'use strict';
 class RavenTutorial{
  constructor(options){
   this.o=options;this.state={version:1,step:0,done:false,skipped:false};this.presented=-1;this.resumeBefore=false;this.saved=false;
   try{const s=JSON.parse(localStorage.getItem('ai-dungeon:tutorial:v1'));if(s&&s.version===1&&Number.isInteger(s.step)&&s.step>=0&&s.step<=6&&typeof s.done==='boolean'&&typeof s.skipped==='boolean')this.state=s;}catch{}
   this.o.get('tutorial-next').addEventListener('click',()=>this.next());
   this.o.get('tutorial-skip').addEventListener('click',()=>this.skip());
   this.o.get('tutorial-replay').addEventListener('click',()=>this.replay());
  }
  store(){try{localStorage.setItem('ai-dungeon:tutorial:v1',JSON.stringify(this.state));}catch{}}
  notes(sim){const c=sim.character;return [
   ['欢迎来到艾尔文边境。我是史官鸦羽。角色自己移动、做决定和战斗；你负责观察、暂停与回顾。','开始教学',null],
   ['职业决定解决问题的方式，也自动绑定守护神。选择名字与性格后创建；高级设定可以保持默认。','下一步','#class-input'],
   ['小镇是起点。地图上的人是角色真实位置；世界时间按行动推进，暂停与倍速只改变播放。','下一步','#dungeon'],
   ['居民已经实际与你的角色交流。关系与重要记忆来自已做的选择，回访还需要到场和时间。','下一步','#saga-list'],
   ['首次交锋或事件判定已经发生。d20检定、HP、有限技能和神眷决定结果；角色会自行治疗或撤退。','下一步','.combat-panel'],
   ['成长或装备已经实际改变人物卡。背景设定等级不等于战斗等级，换装理由可在日志查看。','下一步','.character-panel'],
   ['本次冒险已保存或收束。读取会暂停恢复；个人传记按事实编号保存关键经历，今后可以导出战报。','完成教学','#biography']
  ];}
  eligible(sim){const k=this.state.step,h=sim.world.history;return k<2||k===2&&this.o.active()&&!this.o.get('create-dialog').open||k===3&&h.some(r=>r.facts?.npc)||k===4&&h.some(r=>['battle','result','quest-check'].includes(r.type))||k===5&&h.some(r=>['levelup','equip'].includes(r.type))||k===6&&(this.saved||sim.status!=='alive');}
  update(sim){
   if(this.sim&&this.sim!==sim)this.saved=false;
   this.sim=sim;const panel=this.o.get('raven'),create=this.o.get('create-dialog');
   const home=this.o.get('welcome-screen'),end=this.o.get('ending-dialog');
   if(create.open){if(panel.parentNode!==create)create.prepend(panel);}else if(end?.open){if(panel.parentNode!==end)end.prepend(panel);}else if(home&&!home.hidden){this.o.get('home-guide-slot').append(panel);}else if(panel.parentNode!==document.querySelector('.app')){document.querySelector('.layout').before(panel);}
   panel.hidden=this.state.done||this.state.skipped;
   if(panel.hidden)return;
   const ready=this.eligible(sim),[message,label,selector]=this.notes(sim)[this.state.step];
   this.o.get('raven-text').textContent=ready?message:'鸦羽正在观察，下一段讲解会在真实事件发生后出现。你可以继续观看或跳过。';
   this.o.get('tutorial-next').textContent=label;this.o.get('tutorial-next').disabled=!ready;
   if(ready&&this.presented!==this.state.step){this.presented=this.state.step;this.resumeBefore=this.o.pause();if(selector)this.o.reveal(selector);}
  }
  characterStarted(){if(!this.state.done&&!this.state.skipped&&this.state.step<2){this.state.step=2;this.presented=-1;this.store();}}
  next(){if(!this.sim||!this.eligible(this.sim))return;const before=this.resumeBefore;this.resumeBefore=false;if(this.state.step===6)this.state.done=true;else this.state.step++;this.presented=-1;this.store();if(this.state.step===1)this.o.openCreation?.();this.o.resume(before);}
  skip(){const before=this.resumeBefore;this.resumeBefore=false;this.state.skipped=true;this.store();this.o.resume(before);}
  replay(){this.state={version:1,step:0,done:false,skipped:false};this.presented=-1;this.store();this.o.resume(false);}
  noteSave(){this.saved=true;}
 }
 root.RavenTutorial=RavenTutorial;
})(globalThis);
