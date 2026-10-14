/* 只读取模拟状态并绘图，不掷骰、不改变世界。像素角色沿用 v0.2。 */
(function (root) {
  'use strict';
  const sprites = {
    hero: ['..............', '.....ggg......', '....gCCgg.....', '....CffCg..s..', '....CffC...s..', '....CCCC...s..', '..bbCCCCaa.s..', '..bSbaaaaf.s..', '..bSbSaSaaSs..', '..bbbSaSaa.g..', '....aaaaa.....', '....CaSaC.....', '....b...b.....', '..............'],
    skeleton: ['..............', '.....bbbb.....', '....bffffb....', '....bfbbfb....', '....bffffb.r..', '.....fbf...r..', '......f....r..', '...fffbfff.r..', '..f..fff..fr..', '.....fbf..rr..', '.....fff......', '....f...f.....', '...ff...ff....', '..............']
  };
  class MapView {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }
    rect(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(x, y, w, h); }
    text(text, x, y, color = '#d6c6a7', size = 12) {
      this.ctx.fillStyle = color; this.ctx.font = `${size}px system-ui, "Microsoft YaHei", sans-serif`; this.ctx.textAlign = 'center';
      this.ctx.fillText(text, x, y);
    }
    sprite(p, type, cell, classId = 'warrior') {
      const palette = { g: '#d7b36e', C: classId === 'mage' ? '#775591' : classId === 'rogue' ? '#35756c' : '#873f49',
        f: '#ead9b6', a: '#637f8c', S: '#c4d0d0', s: '#eff0d5', b: '#1a202a', r: '#a07c68' };
      const pixel = cell / 14;
      this.rect(p.x * cell + 4, p.y * cell + cell - 5, cell - 8, 3, '#10141b');
      sprites[type].forEach((row, y) => [...row].forEach((color, x) => {
        if (color !== '.') this.rect(p.x * cell + x * pixel, p.y * cell + y * pixel, pixel, pixel, palette[color]);
      }));
    }
    health(p, cell, actor, color) {
      this.rect(p.x * cell + 3, p.y * cell + cell - 3, cell - 6, 2, '#171b22');
      this.rect(p.x * cell + 3, p.y * cell + cell - 3, (cell - 6) * actor.hp / actor.maxHp, 2, color);
    }
    tree(x, y, cell, hash) {
      const px = x * cell, py = y * cell;
      this.rect(px + cell * .47, py + cell * .55, 4, cell * .35, '#514236');
      this.rect(px + cell * .2, py + cell * .4, cell * .65, cell * .28, hash % 2 ? '#20392f' : '#253d33');
      this.rect(px + cell * .3, py + cell * .23, cell * .45, cell * .25, '#2e4c3c');
      this.rect(px + cell * .42, py + cell * .12, cell * .2, cell * .24, '#3b5844');
    }
    town(p, cell) {
      const x = p.x * cell, y = p.y * cell;
      for (const [dx, dy] of [[-24, -14], [22, -12], [0, -33]]) {
        this.rect(x + dx, y + dy, 28, 24, '#574f45'); this.rect(x + dx - 3, y + dy, 34, 8, '#935f4c');
        this.rect(x + dx + 7, y + dy + 10, 6, 6, '#d5b571'); this.rect(x + dx + 18, y + dy + 14, 6, 10, '#232934');
      }
      this.text('边境小镇', x + cell / 2, y + cell + 19, '#e6c481', 14);
      this.text('旅馆 · 商店 · 公共路图', x + cell / 2, y + cell + 37, '#a29c8e', 10);
    }
    world(sim) {
      const A = root.Adventure, cell = this.canvas.width / 21;
      for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
        const hash = (x * 7 + y * 11) % 17, px = x * cell, py = y * cell;
        this.rect(px, py, cell, cell, hash % 2 ? '#182b27' : '#172725');
        if (sim.world.roadMap[y][x]) {
          this.rect(px + 1, py + 1, cell - 2, cell - 2, '#4a4438');
          this.rect(px + 3, py + cell / 2, cell - 6, 2, '#655a45');
          this.rect(px + cell / 2, py + 3, 2, cell - 6, '#3b3931');
        } else if (hash % 3 !== 0) this.tree(x, y, cell, hash);
        else { this.rect(px + 9, py + 12, 6, 3, '#2e3d33'); this.rect(px + 17, py + 22, 3, 3, '#52604b'); }
      }
      this.town(A.TOWN, cell);
      if (sim.world.npcs) for (const [index, n] of Object.values(sim.world.npcs).entries()) {
        if (!n.available) continue;
        const p = n.location, offset = p.region === 'town' ? index * 8 - 14 : 0;
        this.rect((p.x + .5) * cell + offset, p.y * cell - 7, 5, 7, ['#e5ca8b', '#94ae86', '#a1b8c8', '#b39bc5'][index]);
      }
      this.text('北 部 森 林', 230, 108, '#c1c9a9', 18);
      this.text('公开道路 · 林间路口', 230, 130, '#91a38c', 11);
      for (const site of A.SITES) {
        const visited = sim.world.siteTimes[root.DungeonCore.keyOf(site.x, site.y)] !== undefined;
        this.rect(site.x * cell + 11, site.y * cell + 11, 11, 11, visited ? '#98a076' : '#a57f50');
        this.rect(site.x * cell + 14, site.y * cell + 14, 5, 5, '#29322b');
      }
      if (sim.character.knowledge.includes('ruins')) {
        const x = A.RUINS.x * cell, y = A.RUINS.y * cell;
        this.rect(x - 8, y - 24, cell + 16, cell + 27, '#20262c');
        this.rect(x - 8, y - 24, 10, cell + 27, '#6b6b67'); this.rect(x + cell - 2, y - 24, 10, cell + 27, '#6b6b67');
        this.rect(x + 2, y - 24, cell - 4, 9, '#84816f');
        this.rect(x + 8, y - 13, cell - 16, cell + 9, '#080c12');
        this.text(sim.world.ruinsCleared ? '古代遗迹 · 已探索' : '古代遗迹', x + cell / 2, y - 38, '#d2c19f', 13);
      }
      if (sim.destination) {
        const p = sim.destination;
        this.ctx.strokeStyle = '#d8b679'; this.ctx.lineWidth = 2;
        this.ctx.strokeRect(p.x * cell + 3, p.y * cell + 3, cell - 6, cell - 6);
      }
      this.actor(sim, cell);
      if (sim.pending || sim.fieldCombat?.battle) this.text(sim.pending ? '?' : '⚔',
        (sim.character.position.x + .5) * cell, sim.character.position.y * cell - 4, '#efca81', 18);
    }
    dungeon(sim) {
      const d = sim.dungeon, cell = this.canvas.width / 25;
      for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
        const tile = d.explorer.known[y][x], px = x * cell, py = y * cell;
        if (tile === -1) continue;
        if (tile === 0) {
          this.rect(px + 1, py + 1, cell - 2, cell - 2, '#262932'); this.rect(px + 1, py + 1, cell - 2, 2, '#42434a');
          this.rect(px + cell / 2, py + 4, 2, cell - 7, '#161b22'); this.rect(px + 1, py + cell - 3, cell - 2, 2, '#181e23');
        } else {
          const visited = d.explorer.visited.has(root.DungeonCore.keyOf(x, y));
          this.rect(px + 1, py + 1, cell - 2, cell - 2, visited ? ((x + y) % 2 ? '#3d4245' : '#363c40') : '#272c33');
          this.rect(px + 3, py + 3, cell - 6, 1, visited ? '#565958' : '#42464d');
          this.rect(px + cell / 2, py + 5, 1, cell - 9, '#20272f');
          if ((x * 7 + y * 11) % 9 === 0) { this.rect(px + 5, py + 17, 5, 2, '#232a30'); this.rect(px + 9, py + 19, 2, 4, '#232a30'); }
        }
      }
      for (const chest of d.chests) if (chest.discovered && !chest.resolved) {
        const x = chest.x * cell, y = chest.y * cell;
        this.rect(x + 6, y + 9, 17, 13, '#966b44'); this.rect(x + 6, y + 9, 17, 3, '#c69b63');
        this.rect(x + 13, y + 12, 3, 7, '#ecd08b');
      }
      for (const monster of d.encounters.monsters) if (monster.hp > 0 && d.encounters.discovered.has(monster.id)) {
        this.sprite(monster, 'skeleton', cell); this.health(monster, cell, monster, '#b85457');
        if (d.encounters.battle?.target === monster) {
          this.ctx.strokeStyle = '#e07f65'; this.ctx.lineWidth = 2;
          this.ctx.strokeRect(monster.x * cell + 1, monster.y * cell + 1, cell - 2, cell - 2);
        }
      }
      this.rect(d.start.x * cell + 3, d.start.y * cell + 3, 7, 7, '#68a99a');
      this.actor(sim, cell);
    }
    actor(sim, cell) {
      const p = this.visualPosition || sim.character.position;
      this.rect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2, '#d8b67918');
      this.sprite(p, 'hero', cell, sim.character.classId); this.health(p, cell, sim.character, '#d8b679');
    }
    draw(sim) {
      if (this.frame) cancelAnimationFrame(this.frame);
      const previous = this.lastPosition, current = { ...sim.character.position, phase: sim.phase };
      this.lastPosition = current; this.visualPosition = null;
      const canAnimate = previous && previous.phase === current.phase && sim.status !== 'dead' &&
        Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) === 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!canAnimate) { this.paint(sim); return; }
      const start = performance.now();
      const animate = now => {
        const fraction = Math.min(1, (now - start) / 120);
        this.visualPosition = { x: previous.x + (current.x - previous.x) * fraction, y: previous.y + (current.y - previous.y) * fraction };
        this.paint(sim);
        this.frame = fraction < 1 ? requestAnimationFrame(animate) : null;
      };
      animate(start);
    }
    paint(sim) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.rect(0, 0, this.canvas.width, this.canvas.height, '#070a0d');
      if (sim.phase === 'dungeon') this.dungeon(sim); else this.world(sim);
      if (sim.status === 'dead') {
        this.rect(0, 0, this.canvas.width, this.canvas.height, '#110e17b8');
        this.text('冒险终结', this.canvas.width / 2, this.canvas.height / 2, '#e5ada1', 30);
        this.text('新建角色，或重新生成世界', this.canvas.width / 2, this.canvas.height / 2 + 34, '#baa99c', 13);
      }
    }
  }
  root.LegacyMapView = MapView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
