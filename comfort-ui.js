/* UI comfort, original raven portrait and separate local metagame; reads game facts only. */
(function(root){
  'use strict';
  function paintRaven(canvas){
    const g=canvas.getContext('2d'),s=canvas.width/32;g.clearRect(0,0,canvas.width,canvas.height);g.imageSmoothingEnabled=false;
    const rect=(x,y,w,h,color)=>{g.fillStyle=color;g.fillRect(x*s,y*s,w*s,h*s);};
    rect(0,0,32,32,'#c3ad7b');rect(2,2,28,28,'#283c39');
    rect(9,23,17,3,'#bea878');rect(11,26,13,2,'#7b6047');rect(10,24,14,1,'#ede0b2');
    rect(8,8,15,16,'#171c28');rect(6,12,4,9,'#24273a');rect(19,6,5,8,'#171c28');
    rect(9,7,10,4,'#35314b');rect(7,11,5,4,'#45405d');rect(7,17,12,5,'#343247');rect(10,18,9,2,'#55506c');
    rect(21,13,7,3,'#bc975f');rect(24,15,3,2,'#8a6846');rect(21,11,3,3,'#ebd38d');rect(22,12,1,1,'#151d22');
    rect(17,10,7,1,'#ddbd71');rect(16,11,1,5,'#ddbd71');rect(23,11,1,5,'#ddbd71');rect(17,16,6,1,'#ddbd71');
    rect(14,21,2,4,'#856655');rect(18,21,2,4,'#856655');rect(8,25,8,1,'#27372e');
    rect(4,5,2,13,'#d6d0b0');rect(3,4,2,7,'#ece5c1');rect(2,4,2,3,'#9586b0');rect(4,17,1,4,'#9d7354');
  }
  const endingWords={guardian:'守护的后果有事实作证。你留下的灯火，比一句豪言更可靠。',seeker:'碑文与法阵都已经留下实际记录。下一次，同样的好奇心也可能遇到不同代价。',profiteer:'财富与机会确实到手，关系与风险也确实记账。再换一种性格看看，边境会如何回应。',survivor:'没有把未完成的任务写成胜利，仍然活着也值得这一页。下一位旅人可以选择不同的目标。',fallen:'我不会擦掉伤害，也不会凭空补一次胜利。故事到这里结束；下一局还有一条真正未走过的路。'};
  class ComfortUI{
    constructor(o){
      this.o=o;this.$=o.get;try{this.storage=localStorage;}catch{this.storage={getItem(){return null;},setItem(){throw Error('storage unavailable');}};}this.prefs=Chronicles.loadSettings(this.storage);this.book=Chronicles.loadBook(this.storage);this.feedback=new Chronicles.Feedback();this.wasPlaying=false;this.renderedId=-1;this.renderedMode='';this.storageOk=true;this.bookDamaged=false;
      try{const raw=this.storage.getItem(Chronicles.BOOK_KEY);if(raw){const b=JSON.parse(raw);this.bookDamaged=!(b?.version===1&&Array.isArray(b.heroes)&&b.heroes.length<=30&&b.heroes.every(Chronicles.validHero)&&new Set(b.heroes.map(h=>h.id)).size===b.heroes.length);}}catch{this.bookDamaged=true;}
      for(const canvas of document.querySelectorAll('.raven-avatar'))paintRaven(canvas);
      this.$('narration-mode').value=this.prefs.narration;this.$('comfort-effects').checked=this.prefs.effects;this.$('effects-input').checked=this.prefs.effects;
      for(const id of ['home-settings','settings'])this.$(id).addEventListener('click',()=>this.openSettings());
      this.$('settings-close').addEventListener('click',()=>this.$('settings-dialog').close());
      this.$('settings-dialog').addEventListener('close',()=>{const before=this.wasPlaying;this.wasPlaying=false;this.o.resume(before);});
      this.$('narration-mode').addEventListener('change',()=>{this.prefs.narration=this.$('narration-mode').value;this.savePrefs();});
      this.$('comfort-effects').addEventListener('change',()=>{this.prefs.effects=this.$('comfort-effects').checked;this.$('effects-input').checked=this.prefs.effects;this.savePrefs();});
      this.$('effects-input').addEventListener('change',()=>{this.prefs.effects=this.$('effects-input').checked;this.$('comfort-effects').checked=this.prefs.effects;this.savePrefs();});
      this.$('reset-tutorial').addEventListener('click',()=>{this.o.tutorial().reset();this.$('settings-notice').textContent='教学笺页已重置；关闭设置后可重新开始，当前冒险保持原样。';});
      this.$('chronicles-dialog').addEventListener('close',()=>{const before=this.bookWasPlaying;this.bookWasPlaying=false;this.o.resume(before);});
      for(const id of ['home-chronicles','chronicles','ending-chronicles'])this.$(id).addEventListener('click',()=>this.openBook());
    }
    openSettings(){this.wasPlaying=this.o.pause();this.$('settings-dialog').showModal();this.o.refresh();}
    savePrefs(){const ok=Chronicles.write(this.storage,Chronicles.SETTINGS_KEY,this.prefs);this.$('settings-notice').textContent=ok?'观看偏好已保存，角色决定与随机源没有变化。':'浏览器未允许保存偏好，本页仍然生效。';this.renderedMode='';this.o.refresh();}
    update(sim){
      if(this.renderedSim!==sim){this.renderedSim=sim;this.renderedId=-1;}
      const f=this.feedback.observe(sim),mode=this.prefs.narration,c=sim.character;
      this.$('class-insignia').textContent=({warrior:'✚ 誓卫 · 战士',rogue:'◇ 夜路 · 游荡者',mage:'✧ 织光 · 法师'}[c.classId]);
      const labels={courage:'勇敢',caution:'谨慎',greed:'逐利',kindness:'善良',curiosity:'好奇'};
      const dominant=Object.entries(c.traits).sort((a,b)=>b[1]-a[1])[0];this.$('representative-trait').textContent=labels[dominant[0]]+'倾向 '+dominant[1];
      this.$('goal-change').hidden=!f.goal;this.$('goal-change').textContent=f.goal?'目标改变 · '+f.goal.title+'。'+f.goal.reason:'';
      const battle=f.combat;this.$('combat-result-card').hidden=!battle;
      if(battle){this.$('combat-result-title').textContent=battle.title;this.$('combat-result-outcome').textContent=battle.outcome;this.$('combat-result-detail').textContent=battle.detail+' · 事实#'+battle.factId;}
      this.$('raven-companion').hidden=mode==='off';
      if(f.raven){this.$('raven-source').textContent='事实#'+f.raven.id+' · '+Chronicler.date(f.raven.time);this.$('raven-companion-text').textContent=Chronicler.describe(f.raven,c,mode);}
      else this.$('raven-companion-text').textContent='先看真实的第一步。我的旁注会在关键事实发生后出现。';
      if(this.renderedId===sim.world.recordId&&this.renderedMode===mode)return;
      this.renderedId=sim.world.recordId;this.renderedMode=mode;
      const cards=f.cards.slice(-3).reverse();
      this.$('event-cards').replaceChildren(...cards.map(card=>{const article=document.createElement('article');article.className='event-card';article.dataset.type=card.type;const heading=document.createElement('div'),img=document.createElement('img'),title=document.createElement('strong'),tag=document.createElement('span'),cause=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');img.src='assets/'+card.icon+'.png';img.className='item-icon';img.alt='';title.textContent=card.title;tag.textContent=card.label;heading.append(img,title,tag);cause.textContent=card.cause;summary.textContent='核对实际结果 · #'+card.id;text.textContent=card.detail;details.append(summary,text);article.append(heading,cause,details);return article;}));
      if(!cards.length){const p=document.createElement('p');p.className='hint';p.textContent='真实行动发生后，关键节点会在这里留下可核对的回响。';this.$('event-cards').append(p);}
    }
    ending(sim){
      const hero=Chronicles.heroRecord(sim);if(!hero){this.$('ending-choice').textContent='冒险尚未结束，当前战报只记录已经发生的事实。';this.$('ending-battle').textContent='最终代表交锋会在收束时选录。';this.$('ending-timeline').replaceChildren();this.$('raven-epilogue').textContent='鸦羽：故事还在路上，别催我的最后一行。';this.$('archive-status').textContent='进行中的冒险不会提前写入英雄名册。';return;}
      this.$('ending-choice').textContent=hero.choice;this.$('ending-battle').textContent=hero.battle;
      this.$('ending-timeline').replaceChildren(...hero.timeline.map(r=>{const li=document.createElement('li'),stamp=document.createElement('span'),p=document.createElement('p');stamp.textContent=Chronicler.date(r.time)+' · 事实#'+r.id;p.textContent=r.text;li.append(stamp,p);return li;}));
      this.$('raven-epilogue').textContent='鸦羽：'+endingWords[hero.code];
      const added=Chronicles.addHero(this.book,hero);if(added)this.storageOk=!this.bookDamaged&&Chronicles.write(this.storage,Chronicles.BOOK_KEY,this.book);
      this.$('archive-status').textContent=this.bookDamaged?'旧名册格式损坏，原始数据未覆盖；本次记录暂存本页，故事仍可下载。':this.storageOk?'本局已收录英雄编年史 · '+this.book.heroes.length+'/30。相同设定/种子/结局恢复不重复收录。':'浏览器限制名册保存，本次记录仅在当前页面；可以下载故事保留。';
    }
    openBook(){
      this.bookWasPlaying=this.o.pause();this.o.refresh();this.$('chronicles-notice').textContent='只收录已经真实结束的冒险。最多30位；同设定/种子/结果去重，浏览器本地保存。';
      this.$('fate-codex').replaceChildren(...Chronicles.fateIndex(this.book).map(f=>{const item=document.createElement('article');item.className='fate-entry'+(f.count?' unlocked':'');const h=document.createElement('h3'),p=document.createElement('p');h.textContent=f.count?f.title:'未收录 · '+f.title;p.textContent=f.count?'已见证 '+f.count+' 位旅人的命运':'换一种性格与目标，也许会走出另一条真实的路。';item.append(h,p);return item;}));
      this.$('hero-roster').replaceChildren(...this.book.heroes.slice().reverse().map(h=>{const item=document.createElement('details'),sum=document.createElement('summary'),p=document.createElement('p'),choice=document.createElement('p');sum.textContent=h.name+' · '+h.title;p.textContent=({warrior:'战士',rogue:'游荡者',mage:'法师'}[h.classId])+' / '+Object.values(FateRules.PATRONS).find(p=>p.id===h.patronId).name+' / 存活 '+h.days+'天 / 等级'+h.level+' / 击杀'+h.kills;choice.textContent=h.choice;item.append(sum,p,choice);return item;}));
      if(!this.book.heroes.length){const p=document.createElement('p');p.textContent='编年史还没有墨迹。完成第一段冒险后，真实结局会在这里留下名字。';this.$('hero-roster').append(p);}this.$('chronicles-dialog').showModal();
    }
  }
  root.ComfortUI=ComfortUI;
})(globalThis);
