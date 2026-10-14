'use strict';
const assert = require('node:assert/strict');
const { generateDungeon, Explorer, spawnSkeletons, attack, Encounters, HERO_STATS, SKELETON_STATS, FLOOR, UNKNOWN, keyOf } = require('../core.js');

function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

let maxSteps = 0;
for (let seed = 1; seed <= 300; seed++) {
  const { grid, start, floorCount } = generateDungeon(25, seededRandom(seed));
  const ai = new Explorer(grid.length, start);
  const monsters = spawnSkeletons({ grid, start }, seededRandom(seed + 900));
  assert.ok(monsters.length >= 3 && monsters.length <= 5);
  assert.equal(new Set(monsters.map(m => keyOf(m.x, m.y))).size, monsters.length);
  for (const m of monsters) {
    assert.equal(grid[m.y][m.x], FLOOR);
    assert.notEqual(keyOf(m.x, m.y), keyOf(start.x, start.y));
    assert.equal(m.hp, 10);
  }
  const reachable = new Set([keyOf(start.x, start.y)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const p of ai.neighbors(queue[i])) {
      const key = keyOf(p.x, p.y);
      if (grid[p.y][p.x] === FLOOR && !reachable.has(key)) { reachable.add(key); queue.push(p); }
    }
  }
  assert.equal(reachable.size, floorCount, `种子 ${seed}：地面必须全部连通`);
  assert.ok(grid[0].every(v => v !== FLOOR) && grid[24].every(v => v !== FLOOR));
  assert.ok(grid.every(row => row[0] !== FLOOR && row[24] !== FLOOR));
  const observed = new Set();
  const observe = () => ai.observe((x, y) => {
    assert.ok(Math.abs(x - ai.position.x) + Math.abs(y - ai.position.y) <= 1, '不得读取视野之外');
    observed.add(keyOf(x, y));
    return grid[y][x];
  });
  observe();
  assert.ok(observed.size <= 5, '初始只知道起点和四邻格');
  // 最近未知地面每条路径至多 floorCount-1 步，且每条路径必增加一个已走过格。
  const bound = floorCount * floorCount;
  while (!ai.complete && ai.steps <= bound) {
    const before = { ...ai.position };
    const event = ai.advance();
    if (event.moved) {
      assert.equal(Math.abs(before.x - ai.position.x) + Math.abs(before.y - ai.position.y), 1);
      assert.equal(grid[ai.position.y][ai.position.x], FLOOR, '不可穿墙');
      observe();
    }
  }
  assert.ok(ai.complete, `种子 ${seed}：应在有限步数内完成`);
  assert.equal(ai.visited.size, floorCount, '结束时必须走过全部地面');
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid.length; x++) {
      assert.equal(ai.known[y][x], observed.has(keyOf(x, y)) ? grid[y][x] : UNKNOWN);
    }
  }
  const finalSteps = ai.steps;
  assert.equal(ai.advance().moved, false);
  assert.equal(ai.steps, finalSteps, '完成后不得继续移动');
  maxSteps = Math.max(maxSteps, ai.steps);
}

// 明确的分叉死路：必须通过已走过的格子返回另一分支。
const branchGrid = [[0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]];
const branchAI = new Explorer(5, { x: 2, y: 2 });
let sawReturn = false;
while (!branchAI.complete && branchAI.steps < 30) {
  branchAI.observe((x, y) => branchGrid[y][x]);
  const event = branchAI.advance();
  sawReturn ||= !!event.replanned;
}
assert.ok(branchAI.complete && sawReturn);
assert.equal(branchAI.visited.size, 5);
console.log(`检查通过：300 张随机地图连通、局部观察、合法移动、完整探索及终止；分叉回溯通过。最大移动步数 ${maxSteps}。`);

const hero = () => ({ ...HERO_STATS, hp: 30 });
const skeleton = (id = 1, x = 2, y = 1) => ({ ...SKELETON_STATS, hp: 10, id, x, y });
const rolls = values => { let index = 0; return () => { assert.ok(index < values.length, '不应多掷骰'); return values[index++]; }; };
let target = skeleton();
assert.equal(attack(hero(), target, rolls([0])).hit, false, '自然 1 必定失手');
assert.equal(target.hp, 10);
const lowArmor = { ...skeleton(), ac: 1 };
assert.equal(attack(hero(), lowArmor, rolls([0])).hit, false, '自然 1 不受攻击加值影响');
const highArmor = { ...skeleton(), ac: 100, hp: 100 };
let result = attack(hero(), highArmor, rolls([0.999, 0, 0.999]));
assert.ok(result.hit && result.critical, '自然 20 必定命中');
assert.deepEqual(result.dice, [1, 8]); assert.equal(result.damage, 12, '重击只增加伤害骰，固定加值不翻倍');
target = skeleton();
result = attack(hero(), target, rolls([0.3, 0])); // d20=7，7+5 正好等于 AC12。
assert.ok(result.hit); assert.equal(result.damage, 4); assert.equal(target.hp, 6);
result = attack(hero(), target, rolls([0.25])); // d20=6。
assert.equal(result.hit, false); assert.equal(target.hp, 6);
target = skeleton();
assert.equal(attack(hero(), target, rolls([0.999, 0.999, 0.999])).hp, 0, 'HP 不得为负数');
result = attack(skeleton(), hero(), rolls([0.999, 0.999, 0.999]));
assert.equal(result.damage, 13); assert.equal(result.hp, 17);

// 未发现怪物不得触发战斗；相邻两只依次处理，死亡怪物不能再攻击。
const observer = new Explorer(5, { x: 2, y: 2 });
const encounters = new Encounters([skeleton(1), skeleton(2, 3, 2), skeleton(3, 1, 1)], () => 0.999);
assert.equal(encounters.begin(observer), null);
assert.equal(encounters.observe(observer).length, 2);
assert.equal(encounters.discovered.has(3), false, '对角格不在视野内');
assert.equal(encounters.observe(observer).length, 0, '发现日志不重复');
assert.equal(encounters.begin(observer).id, 1);
assert.ok(encounters.advance().victory);
assert.equal(encounters.kills, 1);
assert.equal(encounters.begin(observer).id, 2);
assert.ok(encounters.advance().victory);
assert.equal(encounters.begin(observer), null);
assert.equal(encounters.kills, 2);
assert.equal(encounters.advance(), null);
const doomed = new Encounters([skeleton()], rolls([0, 0.999, 0.999, 0.999]));
doomed.hero.hp = 1;
doomed.observe(observer); doomed.begin(observer);
assert.equal(doomed.advance().hit, false);
assert.ok(doomed.advance().failed);
assert.equal(doomed.hero.hp, 0); assert.equal(doomed.advance(), null);
assert.equal(doomed.begin(observer), null);

let wins = 0, losses = 0;
for (let seed = 1; seed <= 300; seed++) {
  const random = seededRandom(seed);
  const dungeon = generateDungeon(25, random);
  const ai = new Explorer(25, dungeon.start);
  const encounter = new Encounters(spawnSkeletons(dungeon, random), random);
  const observe = () => { ai.observe((x, y) => dungeon.grid[y][x]); encounter.observe(ai); };
  observe();
  for (let action = 0; action < 20000 && !ai.complete && encounter.hero.hp > 0; action++) {
    const before = { ...ai.position };
    if (encounter.battle) {
      encounter.advance();
      assert.deepEqual(ai.position, before, '战斗中不得移动');
    } else if (!encounter.begin(ai)) {
      const event = ai.advance();
      if (event.moved) {
        assert.ok(!encounter.monsters.some(m => m.hp > 0 && m.x === ai.position.x && m.y === ai.position.y), '不得穿过活怪物');
        observe(); encounter.begin(ai);
      }
    }
  }
  assert.ok(ai.complete || encounter.hero.hp === 0, `种子 ${seed}：探索或战斗应结束`);
  assert.equal(encounter.kills, encounter.monsters.filter(m => m.hp === 0).length);
  if (ai.complete) {
    wins++; assert.equal(ai.visited.size, dungeon.floorCount);
    assert.equal(encounter.kills, encounter.monsters.length);
  } else losses++;
}
assert.ok(wins > 0 && losses > 0);
console.log(`v0.2 检查通过：怪物生成、视野限制、d20/AC、自然 1/20、伤害骰、连续遭遇、死亡终止；300 轮完整模拟（成功 ${wins}，失败 ${losses}）。`);
