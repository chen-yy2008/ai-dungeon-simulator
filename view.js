/* 图集视觉层：只读模拟状态，保留 legacy-view.js 作为加载失败后备。 */
(function(root){
'use strict';
const P=root.PixelAssets;
class MapView extends root.LegacyMapView {
  constructor(canvas){super(canvas);this.direction=0;this.walkFrame=0;this.ready=P.ready;this.fallback=new root.LegacyMapView(canvas);P.ready.then(()=>{if(this.sim)this.paint(this.sim)});}
  image(id,sx,sy,sw,sh,x,y,w,h,ctx=this.ctx){ctx.drawImage(P.images[id],sx,sy,sw,sh,Math.round(x),Math.round(y),w,h);}
  tile(id,sx,sy,x,y,ctx=this.ctx){this.image(id,sx,sy,16,16,x*32,y*32,32,32,ctx);}
  sprite(p,id,cell,direction=0,frame=0){
    const px=Math.round(p.x*cell/2)*2,py=Math.round(p.y*cell/2)*2;
    this.ctx.fillStyle='#13271b66';this.ctx.beginPath();this.ctx.ellipse(px+16,py+29,11,4,0,0,Math.PI*2);this.ctx.fill();
    this.image(id,direction*16,frame*16,16,16,px,py-4,cell,cell);
  }
  label(text,x,y,accent='#eee0b3'){
    this.ctx.font='12px system-ui, "Microsoft YaHei", sans-serif';const width=this.ctx.measureText(text).width+18;
    this.rect(x-width/2,y-13,width,20,'#14201dde');this.text(text,x,y+1,accent,12);
  }
  background(sim){
    if(this.backgroundMap===sim.world.roadMap)return this.backgroundCanvas;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=672;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const map=sim.world.roadMap;
    for(let y=0;y<21;y++)for(let x=0;x<21;x++){
      this.tile('field',16,112,x,y,ctx);
      if(map[y][x])for(const q of P.roadQuarters(map,x,y))this.image('field',q.sx,q.sy,8,8,x*32+q.qx*16,y*32+q.qy*16,16,16,ctx);
      else if(P.hash(x,y)%7===0)this.image('nature',64+P.hash(x,y)%3*16,160,16,16,x*32,y*32,32,32,ctx);
    }
    // 装饰占地必须为原地图非道路，缓存不会修改碰撞数据。
    const free=(x,y,w,h)=>Array.from({length:h},(_,dy)=>Array.from({length:w},(_,dx)=>x+dx>=0&&x+dx<21&&y+dy>=0&&y+dy<21&&!map[y+dy][x+dx]).every(Boolean)).every(Boolean);
    for(let y=0;y<20;y+=3)for(let x=0;x<20;x+=3){
      const evergreen=P.hash(x,y)%3===0;if(x<9&&y>10||!free(x,y,evergreen?4:3,3))continue;
      this.image('nature',evergreen?0:64,32,evergreen?64:48,48,x*32,y*32,evergreen?128:96,96,ctx);
    }
    if(free(0,11,4,5))this.image('town',400,224,64,80,0,11*32,128,160,ctx);
    if(free(5,17,4,4))this.image('town',400,144,64,64,5*32,17*32,128,128,ctx);
    for(let x=3;x<9;x++)if(map[16][x])this.tile('stone-floor',208,208,x,16,ctx);
    const toned=document.createElement('canvas');toned.width=toned.height=672;const tone=toned.getContext('2d');tone.imageSmoothingEnabled=false;tone.filter='saturate(.82) brightness(.86)';tone.drawImage(canvas,0,0);this.backgroundMap=map;this.backgroundCanvas=toned;return toned;
  }
  world(sim){
    const A=root.Adventure,cell=32;this.ctx.drawImage(this.background(sim),0,0);
    for(const site of A.SITES){
      this.image('book',0,0,16,16,site.x*cell+4,site.y*cell+4,24,24);
      this.text('◆',(site.x+.5)*cell,site.y*cell-3,sim.world.siteTimes[root.DungeonCore.keyOf(site.x,site.y)]===undefined?'#ffe3a0':'#acbd90',10);
    }
    this.label('边境小镇 · 旅馆 / 市集',147,655);this.label('北部森林',323,53,'#e2efd2');
    if(sim.character.knowledge.includes('ruins')){this.image('town',48,128,48,48,16*cell,2*cell,96,96);this.label(sim.world.ruinsCleared?'古代遗迹 · 已探索':'古代遗迹',17.5*cell,59);}
    if(sim.destination){const p=sim.destination;this.ctx.strokeStyle='#fff0b0';this.ctx.lineWidth=2;this.ctx.strokeRect(p.x*cell+3,p.y*cell+3,cell-6,cell-6);}
    const npcSprites={innkeeper:'woman',merchant:'noble',guild:'villager',mage:'sorcererblack'};
    for(const [i,n]of Object.values(sim.world.npcs).entries()){
      if(!n.available&&sim.pending?.npcLock!==n.id)continue;const p=n.location,offset=p.region==='town'?(i-1.5)*.42:0;
      this.sprite({x:p.x+offset,y:p.y-.55},npcSprites[n.id]||'villager',cell);
    }
    if(root.FateRules){const h=root.Adventure.TOWN;this.text('✧',(h.x+.5)*cell,(h.y+.5)*cell,'#fff1b5',22);}
    this.actor(sim,cell);
    if(sim.fieldCombat?.battle){const p=sim.character.position;this.sprite({x:p.x+.7,y:p.y},'hunter',cell,1);this.label('道路遭遇',(p.x+.5)*cell,p.y*cell-18,'#ffd2a0');}
    else if(sim.pending)this.text('!',(sim.character.position.x+.5)*cell,sim.character.position.y*cell-9,'#fff1b3',21);
  }
  dungeon(sim){
    const d=sim.dungeon,cell=32;
    const cacheKey=d.explorer.known.map(r=>r.join('')).join('|')+':'+d.explorer.visited.size;
    if(this.floorKey!==cacheKey){
      const layer=document.createElement('canvas');layer.width=layer.height=800;
      const previous=this.ctx;this.ctx=layer.getContext('2d');this.ctx.imageSmoothingEnabled=false;
      this.rect(0,0,800,800,'#080c13');
    for(let y=0;y<25;y++)for(let x=0;x<25;x++){
      const tile=d.explorer.known[y][x];if(tile===-1)continue;

      if(tile===0)this.tile('stone-wall',16,96,x,y);else this.tile('stone-floor',208+P.hash(x,y)%3*16,224,x,y);

      if(tile===0){if(d.explorer.known[y+1]?.[x]===1)this.image('stone-wall',16,112,16,8,x*cell,y*cell+16,32,16);this.rect(x*cell,y*cell,cell,cell,'#080d1238');}
      else if(!d.explorer.visited.has(root.DungeonCore.keyOf(x,y)))this.rect(x*cell,y*cell,cell,cell,'#080c1260');
    }

      this.ctx=previous;this.floorCanvas=layer;this.floorKey=cacheKey;
    }
    this.ctx.drawImage(this.floorCanvas,0,0);
    for(const chest of d.chests)if(chest.discovered&&!chest.resolved&&d.explorer.known[chest.y][chest.x]!==-1)this.tile('props',48,16,chest.x,chest.y);
    for(const monster of d.encounters.monsters)if(monster.hp>0&&d.encounters.discovered.has(monster.id)&&d.explorer.known[monster.y][monster.x]!==-1){
      this.sprite(monster,'skeleton',cell);this.health(monster,cell,monster,'#dc7970');
      if(d.encounters.battle?.target===monster){this.ctx.strokeStyle='#f6b977';this.ctx.lineWidth=2;this.ctx.strokeRect(monster.x*cell,monster.y*cell,cell,cell);}
    }
    if(d.explorer.known[d.start.y][d.start.x]!==-1)this.text('↙',(d.start.x+.5)*cell,(d.start.y+.7)*cell,'#a5e6c7',23);
    this.actor(sim,cell);
    // 最后覆盖未知格，角色/宝箱/装饰的边缘也不能泄露迷雾。
    for(let y=0;y<25;y++)for(let x=0;x<25;x++)if(d.explorer.known[y][x]===-1)this.rect(x*32,y*32,32,32,'#080c13');
  }
  actor(sim,cell){this.sprite(this.visualPosition||sim.character.position,P.heroFor(sim.character,sim.config),cell,this.direction,this.walkFrame);}
  draw(sim,running=false){
    this.sim=sim;if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
    const previous=this.lastPosition,current={...sim.character.position,phase:sim.phase};this.lastPosition=current;this.visualPosition=null;this.walkFrame=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const latest=sim.world.history.filter(r=>['attack','miracle','levelup','equip','heal','counter'].includes(r.type)).slice(-1)[0];
    const fresh=latest&&latest.id!==this.effectId;this.effectId=latest?.id;
    this.effect=running&&this.effects!==false&&!reduced&&fresh?{type:latest.type,damage:latest.facts.damage||latest.facts.healed||0,turn:latest.facts.turn,alpha:1}:null;
    const moving=running&&previous&&previous.phase===current.phase&&sim.status!=='dead'&&Math.abs(previous.x-current.x)+Math.abs(previous.y-current.y)===1&&!reduced;
    if((!moving&&!this.effect)||P.status!=='ready'){this.paint(sim);return;}
    if(moving)this.direction=current.x<previous.x?1:current.x>previous.x?2:current.y<previous.y?3:0;
    const start=performance.now(),duration=this.effect?360:180;const animate=now=>{
      const elapsed=now-start,fraction=Math.min(1,elapsed/180);
      if(moving){this.visualPosition={x:previous.x+(current.x-previous.x)*fraction,y:previous.y+(current.y-previous.y)*fraction};this.walkFrame=fraction<.45?1:fraction<1?2:0;}
      if(this.effect)this.effect.alpha=Math.max(0,1-elapsed/360);this.paint(sim);this.frame=elapsed<duration?requestAnimationFrame(animate):null;
    };animate(start);
  }
  feedback(sim){
    if(!this.effect||this.effect.alpha<=0)return;const f=this.effect,p=this.visualPosition||sim.character.position;
    let target=p;if(f.type==='attack'&&f.turn==='hero'&&sim.combat?.battle)target=sim.combat.battle.target;
    // 精灵反馈局限于实际已知的目标格，光圈不透露迷雾。
    this.ctx.save();this.ctx.beginPath();this.ctx.rect(target.x*32,target.y*32,32,32);this.ctx.clip();this.ctx.globalAlpha=f.alpha;
    const color=f.type==='miracle'?'#d3a7ff':f.type==='heal'?'#a2f4b2':f.type==='attack'?'#f3b096':'#ffe4a0';
    this.ctx.strokeStyle=color;this.ctx.lineWidth=2;this.ctx.strokeRect(target.x*32+1,target.y*32+1,30,30);
    const label=f.type==='attack'||f.type==='counter'?String(f.damage):f.type==='miracle'?'✧':f.type==='heal'?'+'+f.damage:'↑';
    this.text(label,(target.x+.5)*32,target.y*32+12,color,16);this.ctx.restore();
  }
  paint(sim){
    const size=sim.phase==='dungeon'?(this.overview?800:416):672,ratio=Math.max(1,Math.min(3,root.devicePixelRatio||1));
    if(this.canvas.width!==Math.round(size*ratio))this.canvas.width=this.canvas.height=Math.round(size*ratio);
    this.ctx.imageSmoothingEnabled=false;
    if(P.status!=='ready'){this.ctx.setTransform(1,0,0,1,0,0);this.fallback.paint(sim);return;}
    this.ctx.setTransform(ratio,0,0,ratio,0,0);this.rect(0,0,size,size,'#080c13');
    if(sim.phase==='dungeon'){const p=sim.character.position;this.camera=this.overview?{x:0,y:0}:{x:Math.max(0,Math.min(12,Math.floor(p.x)-6)),y:Math.max(0,Math.min(12,Math.floor(p.y)-6))};this.ctx.save();this.ctx.translate(-this.camera.x*32,-this.camera.y*32);this.dungeon(sim);this.feedback(sim);this.ctx.restore();}else{this.camera={x:0,y:0};this.world(sim);this.feedback(sim);}
    if(sim.status==='dead'){this.rect(0,0,size,size,'#120c17b8');this.text('冒险终结',size/2,size/2,'#ffe4c0',30);}
  }
}
root.MapView=MapView;
})(globalThis);
