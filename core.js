/* 核心算法不依赖 DOM；同一份代码也供 Node.js 检查使用。 */
(function (root) {
  'use strict';

  const UNKNOWN = -1;
  const WALL = 0;
  const FLOOR = 1;
  const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const keyOf = (x, y) => `${x},${y}`;

  function generateDungeon(size = 25, random = Math.random) {
    const grid = Array.from({ length: size }, () => Array(size).fill(WALL));
    const rooms = [];
    const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
    const carve = (x, y) => { grid[y][x] = FLOOR; };
    const corridor = (a, b) => {
      let { x, y } = a;
      const horizontalFirst = random() < 0.5;
      const horizontal = () => { while (x !== b.x) { x += Math.sign(b.x - x); carve(x, y); } };
      const vertical = () => { while (y !== b.y) { y += Math.sign(b.y - y); carve(x, y); } };
      carve(x, y);
      if (horizontalFirst) { horizontal(); vertical(); } else { vertical(); horizontal(); }
    };

    for (let attempt = 0; attempt < 100 && rooms.length < 9; attempt++) {
      const width = integer(3, 6);
      const height = integer(3, 6);
      const x = integer(1, size - width - 1);
      const y = integer(1, size - height - 1);
      if (rooms.some(r => x <= r.x + r.width && x + width >= r.x &&
        y <= r.y + r.height && y + height >= r.y)) continue;
      for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) carve(col, row);
      }
      const center = { x: x + Math.floor(width / 2), y: y + Math.floor(height / 2) };
      if (rooms.length) corridor(rooms[rooms.length - 1].center, center);
      rooms.push({ x, y, width, height, center });
    }
    // 每个新房间都与已有房间连接，因此全部地面属于同一连通分量。
    return { grid, start: { ...rooms[0].center }, floorCount: grid.flat().filter(v => v === FLOOR).length };
  }

  class Explorer {
    constructor(size, start) {
      this.size = size;
      this.position = { ...start };
      this.known = Array.from({ length: size }, () => Array(size).fill(UNKNOWN));
      this.visited = new Set([keyOf(start.x, start.y)]);
      this.steps = 0;
      this.path = [];
      this.complete = false;
      this.deadEnds = new Set();
    }

    neighbors({ x, y }) {
      return DIRECTIONS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter(p => p.x >= 0 && p.y >= 0 && p.x < this.size && p.y < this.size);
    }

    // 观察接口只返回当前位置及四邻格。决策方法不接收真实地图。
    observe(readTile) {
      let discovered = 0;
      for (const p of [this.position, ...this.neighbors(this.position)]) {
        if (this.known[p.y][p.x] !== UNKNOWN) continue;
        const tile = readTile(p.x, p.y);
        if (tile === FLOOR) discovered++;
        this.known[p.y][p.x] = tile;
      }
      return discovered;
    }

    planPath() {
      const queue = [this.position];
      const previous = new Map([[keyOf(this.position.x, this.position.y), null]]);
      // BFS 找到最近的已发现但未走过的地面，路径只经过已知地面。
      for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        const currentKey = keyOf(current.x, current.y);
        if (!this.visited.has(currentKey)) {
          const path = [];
          let cursor = current;
          while (previous.get(keyOf(cursor.x, cursor.y)) !== null) {
            path.push(cursor);
            cursor = previous.get(keyOf(cursor.x, cursor.y));
          }
          return path.reverse();
        }
        for (const next of this.neighbors(current)) {
          const nextKey = keyOf(next.x, next.y);
          if (this.known[next.y][next.x] !== FLOOR || previous.has(nextKey)) continue;
          previous.set(nextKey, current);
          queue.push(next);
        }
      }
      return [];
    }

    advance() {
      if (this.complete) return { complete: true, moved: false };
      let replanned = false;
      if (!this.path.length) {
        this.path = this.planPath();
        replanned = this.path.length > 1;
      }
      if (!this.path.length) {
        this.complete = true;
        return { complete: true, moved: false };
      }
      const here = keyOf(this.position.x, this.position.y);
      const exits = this.neighbors(this.position).filter(p => this.known[p.y][p.x] === FLOOR);
      const deadEnd = exits.length === 1 && this.steps > 0 && !this.deadEnds.has(here);
      if (deadEnd) this.deadEnds.add(here);
      this.position = this.path.shift();
      this.visited.add(keyOf(this.position.x, this.position.y));
      this.steps++;
      return { complete: false, moved: true, replanned, deadEnd };
    }
  }

  const HERO_STATS = { maxHp: 30, ac: 15, attackBonus: 5, damageSides: 8, damageBonus: 3 };
  const SKELETON_STATS = { maxHp: 10, ac: 12, attackBonus: 3, damageSides: 6, damageBonus: 1 };

  function spawnSkeletons(dungeon, random = Math.random) {
    const positions = [];
    dungeon.grid.forEach((row, y) => row.forEach((tile, x) => {
      if (tile === FLOOR && keyOf(x, y) !== keyOf(dungeon.start.x, dungeon.start.y)) positions.push({ x, y });
    }));
    const count = Math.min(positions.length, 3 + Math.floor(random() * 3));
    const monsters = [];
    for (let i = 0; i < count; i++) {
      const index = Math.floor(random() * positions.length);
      monsters.push({ ...SKELETON_STATS, hp: SKELETON_STATS.maxHp, id: i + 1, ...positions.splice(index, 1)[0] });
    }
    return monsters;
  }

  function attack(attacker, defender, random = Math.random) {
    const die = sides => 1 + Math.floor(random() * sides);
    const roll = die(20);
    const total = roll + attacker.attackBonus;
    const critical = roll === 20;
    const hit = roll !== 1 && (critical || total >= defender.ac);
    const dice = hit ? Array.from({ length: critical ? 2 : 1 }, () => die(attacker.damageSides)) : [];
    const damage = hit ? dice.reduce((sum, value) => sum + value, attacker.damageBonus) : 0;
    defender.hp = Math.max(0, defender.hp - damage);
    return { roll, total, critical, hit, dice, damage, hp: defender.hp };
  }

  // 遭遇层独立于原有 BFS；仅把当前局部视野中的怪物纳入已知集合。
  class Encounters {
    constructor(monsters, random = Math.random, hero = null) {
      this.hero = hero || { ...HERO_STATS, hp: HERO_STATS.maxHp };
      this.monsters = monsters;
      this.discovered = new Set();
      this.battle = null;
      this.kills = 0;
      this.random = random;
    }

    observe(explorer) {
      const found = [];
      for (const position of [explorer.position, ...explorer.neighbors(explorer.position)]) {
        const monster = this.monsters.find(m => m.x === position.x && m.y === position.y && m.hp > 0);
        if (monster && !this.discovered.has(monster.id)) {
          this.discovered.add(monster.id);
          found.push(monster);
        }
      }
      return found;
    }

    begin(explorer, ignoredId = null) {
      if (this.battle || this.hero.hp <= 0) return null;
      const target = this.monsters.find(m => m.id !== ignoredId && this.discovered.has(m.id) && m.hp > 0 &&
        Math.abs(m.x - explorer.position.x) + Math.abs(m.y - explorer.position.y) === 1);
      if (!target) return null;
      this.battle = { target, round: 1, turn: 'hero' };
      return target;
    }

    advance() {
      if (!this.battle || this.hero.hp <= 0) return null;
      const { target, turn, round } = this.battle;
      const result = attack(turn === 'hero' ? this.hero : target, turn === 'hero' ? target : this.hero, this.random);
      const victory = target.hp === 0;
      const failed = this.hero.hp === 0;
      if (victory) { this.kills++; this.battle = null; }
      else if (failed) this.battle = null;
      else if (turn === 'hero') this.battle.turn = 'skeleton';
      else { this.battle.turn = 'hero'; this.battle.round++; }
      return { ...result, target, turn, round, victory, failed };
    }
  }

  const core = { generateDungeon, Explorer, spawnSkeletons, attack, Encounters, HERO_STATS, SKELETON_STATS, UNKNOWN, WALL, FLOOR, keyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  root.DungeonCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this);
