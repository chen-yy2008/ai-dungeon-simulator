/* Optional nine-part guided reading of real play; separate schema, no game mutations. */
(function(root){
  'use strict';
  const TOPICS=['初见边境','职业与守护神','地图与世界时间','收藏你的人物卡','事件与关系','地牢与退路','战斗、技能与神迹','成长与装备','结局与传记'];
  const KEY='ai-dungeon:tutorial:v1';
  const fresh=()=>({version:2,step:0,done:false,skipped:false,snoozed:false,remindAt:80});
  function normalize(raw){
    if(raw?.version===1&&Number.isInteger(raw.step)&&raw.step>=0&&raw.step<=6&&typeof raw.done==='boolean'&&typeof raw.skipped==='boolean')return {...fresh(),step:[0,1,2,4,6,7,8][raw.step],done:raw.done,skipped:raw.skipped};
    if(raw?.version===2&&Number.isInteger(raw.step)&&raw.step>=0&&raw.step<9&&['done','skipped','snoozed'].every(k=>typeof raw[k]==='boolean')&&Number.isInteger(raw.remindAt)&&raw.remindAt>=0&&raw.remindAt<1e8)return {...fresh(),step:raw.step,done:raw.done,skipped:raw.skipped,snoozed:raw.snoozed,remindAt:raw.remindAt};
    return fresh();
  }
  class RavenTutorial{
    static totalSteps=9;
    static normalize=normalize;
    constructor(options){
      this.o=options;this.state=fresh();this.presented=-1;this.resumeBefore=false;this.saved=false;this.selector=null;
      try{this.state=normalize(JSON.parse(localStorage.getItem(KEY)));}catch{}
      for(const [id,method]of [['tutorial-next','next'],['tutorial-prev','previous'],['tutorial-skip','skip'],['tutorial-later','snooze'],['tutorial-replay','replay']])options.get(id).addEventListener('click',()=>this[method]());
      window.addEventListener('resize',()=>this.positionFocus());window.addEventListener('scroll',()=>this.positionFocus(),{passive:true});
    }
    store(){try{localStorage.setItem(KEY,JSON.stringify(this.state));}catch{}}
    notes(sim){
      const active=this.o.active()&&!this.o.get('create-dialog').open,c=sim.character,history=sim.world.history;
      const fought=history.some(r=>r.type==='battle')||sim.world.saga.milestones.some(r=>r.type==='battle');
      return [
        ['欢迎。我是边境史官鸦羽。英雄自己选择、移动和战斗；你负责观察命运。骰子不收我的代签——不过，暂停键归你。',null],
        ['职业是解决问题的方式，守护神会改变真实赐福。'+(active?'这位'+c.name+'的选择已经写在人物卡里。':'选好名字与性格，高级设定可以先留给以后。'),active?'.patron-card':'#class-input'],
        ['高亮处是角色真实位置。每次行动推进世界时间；暂停与倍速只改变播放。先看他的目标，再看他走向哪里。','#dungeon'],
        ['人物卡收着HP、职业资源、神眷与真实装备。背景等级是身世，战斗等级才决定本局成长。纸很漂亮，数值也得算数。','.character-panel'],
        ['居民有自己的日程与关系。实际互动会改变物价、委托与援助；关键事件卡说明因果，事实日志保留原始判定。没有发生的回访，我不会预写。','#npc-list'],
        [sim.dungeon?'角色已进入真实遗迹。黑色处仍是未知地面；他只看自身与四邻格，低生命或疲劳会沿已知路线撤退。':'本局尚未进入地牢，不能算作已探索。以后进入时，留意黑色未知区域、物资和退路。','#dungeon'],
        [fought?'交锋已经发生。结果卡说明谁用了什么、命中与实际伤害；普通攻击d20检定，技能、治疗和神迹都有成本，交替行动。':'本局尚无交锋记录。规则仍是自动回合判定；我不会替角色凭空加一次胜利。','.combat-panel'],
        [history.some(r=>['levelup','equip'].includes(r.type))?'升级或换装已经真实发生。看战斗等级、装备槽与变化原因：不是换个称号就偷偷加攻击。':'本局尚无升级或换装记录。以后获得足够XP或合适装备时，人物卡才会显示真实变化。','.growth-row'],
        [sim.status!=='alive'?'旅程已经收束。结局时间线只列真实事实；可复制战报、下载传记，英雄名册会保留这段命运。':'进度已经保存。读取后暂停继续；结束后，结局和关键经历会进入英雄名册。下一位旅人会有自己的路。',sim.status!=='alive'?'#ending-record':'#biography']
      ];
    }
    eligible(sim){
      const step=this.state.step,h=sim.world.history,m=sim.world.saga.milestones;
      return step<2||step===2&&this.o.active()&&!this.o.get('create-dialog').open||step===3&&this.o.active()||step===4&&(h.some(r=>r.facts?.npc)||sim.status!=='alive')||step===5&&(sim.dungeon||sim.status!=='alive')||step===6&&(m.some(r=>r.type==='battle')||sim.status!=='alive')||step===7&&(h.some(r=>['levelup','equip'].includes(r.type))||sim.status!=='alive')||step===8&&(this.saved||sim.status!=='alive');
    }
    clearFocus(){this.o.get('tutorial-shade').hidden=true;document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));this.selector=null;}
    positionFocus(){
      const layer=this.o.get('tutorial-shade'),panel=this.o.get('raven');if(panel.hidden||!this.selector){layer.hidden=true;return;}
      const element=document.querySelector(this.selector);if(!element){layer.hidden=true;return;}
      const r=element.getBoundingClientRect(),w=innerWidth,h=innerHeight,pad=8;
      const x=Math.max(0,r.left-pad),y=Math.max(0,r.top-pad),right=Math.min(w,r.right+pad),bottom=Math.min(h,r.bottom+pad);
      if(right<=x||bottom<=y){layer.hidden=true;return;}layer.hidden=false;
      const boxes=[[0,0,w,y],[0,bottom,w,h-bottom],[0,y,x,bottom-y],[right,y,w-right,bottom-y]];
      layer.querySelectorAll('div').forEach((e,i)=>{const [left,top,width,height]=boxes[i];Object.assign(e.style,{left:left+'px',top:top+'px',width:Math.max(0,width)+'px',height:Math.max(0,height)+'px'});});
      panel.dataset.side=r.right>w*.65?'left':'right';
    }
    update(sim){
      if(this.sim&&this.sim!==sim){this.saved=false;this.presented=-1;this.resumeBefore=false;this.clearFocus();if(this.state.snoozed){this.state.remindAt=sim.actions+80;this.store();}}
      this.sim=sim;const panel=this.o.get('raven'),create=this.o.get('create-dialog'),home=this.o.get('welcome-screen'),end=this.o.get('ending-dialog'),shade=this.o.get('tutorial-shade');
      if(create.open){if(panel.parentNode!==create)create.prepend(panel);create.append(shade);}else if(end.open){if(panel.parentNode!==end)end.prepend(panel);end.append(shade);}else if(!home.hidden){this.o.get('home-guide-slot').append(panel);document.body.append(shade);}else if(panel.parentNode!==document.querySelector('.app')){document.querySelector('.layout').before(panel);document.body.append(shade);}
      if(this.o.get('settings-dialog').open){panel.hidden=true;this.clearFocus();this.presented=-1;return;}
      if(this.state.snoozed&&(sim.actions>=this.state.remindAt||sim.status!=='alive')){this.state.snoozed=false;this.presented=-1;this.store();}
      panel.hidden=this.state.done||this.state.skipped||this.state.snoozed;
      if(panel.hidden){this.clearFocus();return;}
      const ready=this.eligible(sim),[message,selector]=this.notes(sim)[this.state.step];
      this.o.get('raven-text').textContent=ready?message:'我先观察。这一段会在真实事件发生后解锁；现在可以继续冒险，或让我稍后提醒。';
      this.o.get('tutorial-topic').textContent=TOPICS[this.state.step];this.o.get('tutorial-count').textContent=(this.state.step+1)+' / '+TOPICS.length;
      this.o.get('tutorial-progress').style.width=((this.state.step+1)/TOPICS.length*100)+'%';
      this.o.get('tutorial-next').textContent=this.state.step===0?'开始教学':this.state.step===8?'合上教学笺页':'下一步';this.o.get('tutorial-next').disabled=!ready;this.o.get('tutorial-prev').disabled=this.state.step===0;
      if(ready&&this.presented!==this.state.step){this.presented=this.state.step;this.resumeBefore=this.o.pause()||this.resumeBefore;this.clearFocus();this.selector=selector;if(selector){this.o.reveal(selector);document.querySelector(selector)?.classList.add('tutorial-focus');}this.positionFocus();panel.dataset.step=String(this.state.step);}
    }
    move(step){const before=this.resumeBefore;this.resumeBefore=false;this.state.step=step;this.presented=-1;this.clearFocus();this.store();this.o.resume(before);}
    characterStarted(){if(!this.state.done&&!this.state.skipped&&this.state.step<2){this.state.step=2;this.presented=-1;this.store();}}
    next(){if(!this.sim||!this.eligible(this.sim))return;if(this.state.step===8){const before=this.resumeBefore;this.resumeBefore=false;this.state.done=true;this.store();this.clearFocus();this.o.resume(before);return;}const step=this.state.step+1;if(step===1){if(!this.o.active())this.o.openCreation();else this.o.enterGame?.();}this.move(step);}
    previous(){if(this.state.step>0)this.move(this.state.step-1);}
    skip(){const before=this.resumeBefore;this.resumeBefore=false;this.state.skipped=true;this.state.snoozed=false;this.store();this.clearFocus();this.o.resume(before);}
    snooze(){const before=this.resumeBefore;this.resumeBefore=false;this.state.snoozed=true;this.state.remindAt=(this.sim?.actions||0)+80;this.store();this.clearFocus();this.o.resume(before);}
    replay(){this.state=fresh();this.presented=-1;this.store();this.clearFocus();this.o.resume(false);}
    reset(){this.state=fresh();this.presented=-1;this.store();this.clearFocus();}
    noteSave(){this.saved=true;}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={normalize,TOPICS};else root.RavenTutorial=RavenTutorial;
})(globalThis);
