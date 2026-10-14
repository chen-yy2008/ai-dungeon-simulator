/* Stateful NPC schedules and finite causal quests; no UI and no independent RNG. */
(function (root) {
  'use strict';
  const TOWN = { x: 3, y: 16 }, GROVE = { x: 11, y: 7 };
  const DEFINITIONS = [
    { id: 'caravan', title: '失踪的商队', giver: 'guild', receiver: 'merchant', objective: 'forest', dc: 11, reward: 14, traits: { kindness: .35, curiosity: .25 } },
    { id: 'survey', title: '遗迹测绘', giver: 'mage', receiver: 'mage', objective: 'map', dc: 10, reward: 12, traits: { curiosity: .5 } },
    { id: 'threat', title: '道路上的威胁', giver: 'guild', receiver: 'guild', objective: 'combat', dc: 0, reward: 10, traits: { courage: .5, kindness: .15 } },
    { id: 'research', title: '法师的药剂研究', giver: 'mage', receiver: 'mage', objective: 'potion', dc: 12, reward: 6, traits: { curiosity: .4, kindness: .15 } },
    { id: 'favor', title: '欠下的人情', giver: 'innkeeper', receiver: 'innkeeper', objective: 'debt', dc: 0, reward: 0, traits: { greed: .2, kindness: .25 } }
  ];
  const NPCS = [
    { id: 'innkeeper', name: '米菈', role: '旅馆老板', hours: '全天 · 旅馆值守' },
    { id: 'merchant', name: '赛伦', role: '旅行商人', hours: '返镇后 09:00–18:00 · 市集' },
    { id: 'guild', name: '奥林', role: '公会管理员', hours: '08:00–19:00 · 公会' },
    { id: 'mage', name: '薇娅', role: '神秘法师', hours: '12:00–16:00 林地 / 18:00–23:00 小镇' }
  ];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function install(world) {
    if (!world.npcs) world.npcs = Object.fromEntries(NPCS.map(n => [n.id, { ...n, relationship: 0, memories: [], location: { ...TOWN, region: 'town', venue: '居所' }, available: false }]));
    if (!world.quests) world.quests = Object.fromEntries(DEFINITIONS.map(q => [q.id, { stage: 'offer', branch: null, due: 0, offeredAt: null }]));
    if (world.npcWaitDay === undefined) world.npcWaitDay = -1;
  }
  function sync(world) {
    install(world);
    const hour = Math.floor(world.minutes % 1440 / 60), changes = [];
    for (const n of Object.values(world.npcs)) {
      let location = { ...TOWN, region: 'town', venue: '居所' }, available = false;
      if (n.id === 'innkeeper') { location.venue = '旅馆'; available = true; }
      if (n.id === 'guild' && hour >= 8 && hour < 19) { location.venue = '公会'; available = true; }
      if (n.id === 'merchant') {
        if (!world.flags.merchantChoice || world.minutes < world.flags.merchantDue) {
          location = n.location.region === 'forest' ? { ...n.location } : { x: 6, y: 13, region: 'forest', venue: '商旅道路' };
        } else if (hour >= 9 && hour < 18) { location.venue = '市集'; available = true; }
      }
      if (n.id === 'mage' && hour >= 12 && hour < 16) { location = { ...GROVE, region: 'forest', venue: '林间研究地' }; available = true; }
      if (n.id === 'mage' && hour >= 18 && hour < 23) { location.venue = '旧书馆'; available = true; }
      if (n.location.region !== location.region || n.location.venue !== location.venue || n.available !== available) changes.push({ npc: n.id, name: n.name, from: n.location.venue, to: location.venue, available });
      n.location = location; n.available = available;
    }
    return changes;
  }
  function memory(sim, npcId, text, relation = 0) {
    const n = sim.world.npcs[npcId];
    n.relationship = clamp(n.relationship + relation, -100, 100);
    n.memories.push({ time: sim.world.minutes, text });
    if (n.memories.length > 24) n.memories.shift();
  }
  function prerequisites(sim, q) {
    if (q.id === 'caravan') return sim.world.scouting >= 1;
    if (q.id === 'survey') return sim.character.knowledge.includes('ruins');
    if (q.id === 'threat') return sim.world.scouting >= 2;
    if (q.id === 'research') return sim.world.quests.survey.stage === 'complete';
    return sim.world.clock.day >= 2;
  }
  function present(sim, id) {
    const n = sim.world.npcs[id], p = sim.character.position;
    return n.available && n.location.region === p.region && Math.abs(n.location.x - p.x) + Math.abs(n.location.y - p.y) <= 1;
  }
  function finishLater(sim, q, branch) {
    const state = sim.world.quests[q.id]; state.stage = 'followup'; state.branch = branch; state.due = sim.world.minutes + 1440;
    memory(sim, q.giver, `${q.title}：记录结果 ${branch}`);
    sim.remember('quest-' + q.id, `${q.title}：${branch === 'declined' ? '婉拒委托' : '完成现场行动，等待之后回访'}`);
  }
  function offer(sim, q) {
    const c = sim.character, state = sim.world.quests[q.id], npc = sim.world.npcs[q.giver];
    const score = 20 + Object.entries(q.traits).reduce((sum, [key, weight]) => sum + c.traits[key] * weight, 0) + npc.relationship * .15;
    const chosen = sim.agent.choose([
      { action: 'accept', score: score + (c.goal === 'wealth' && q.reward ? 12 : 0), allowed: q.id !== 'research' || c.potions > 0 },
      { action: 'decline', score: 20 + c.traits.caution * .3 + (c.hp / c.maxHp < .5 ? 30 : 0) }
    ], () => sim.random.next());
    state.offeredAt = sim.world.minutes; sim.time(15);
    sim.intention(q.title, `结合性格、目标和物资评分，${chosen.action === 'accept' ? '接受' : '婉拒'}${npc.name}的请求（评分 ${chosen.score.toFixed(1)}）。`);
    if (chosen.action === 'decline') finishLater(sim, q, 'declined');
    else {
      state.stage = 'active';
      if (q.id === 'favor') { c.gold += 8; sim.world.flags.innDebt = 8; finishLater(sim, q, 'borrowed'); }
    }
    const objective = { forest: '调查林间遗失的货物', map: '根据实际探索记录绘制遗迹草图', combat: '处理道路上的盗匪哨兵', potion: '用一瓶已有药水协助研究', debt: '借入 8 金币，并在日后偿还或劳动抵偿' }[q.objective];
    sim.record('quest', q.title, `${npc.name}提出：${objective}。${chosen.action === 'accept' ? '角色已接受' : '角色已婉拒'}。`, undefined,
      { quest: q.id, npc: npc.id, action: chosen.action, score: chosen.score, stage: state.stage });
  }
  function investigate(sim, q) {
    const c = sim.character, roll = sim.random.integer(1, 20), total = roll + c.exploreBonus, success = total >= q.dc;
    sim.time(q.id === 'survey' ? 25 : 20, 3);
    if (q.id === 'research') {
      c.potions--; c.potions = clamp(c.potions + (success ? 2 : 0), 0, 9);
    }
    if (q.id === 'caravan' && success) sim.item({ id: 'caravanCargo', name: '待交付商队货物', value: 0 });
    finishLater(sim, q, success ? 'success' : 'failure');
    sim.intention(q.title, '按已知现场与已有资源进行一次合法调查，等待日后向委托人报告。');
    sim.record('quest-check', q.title, `d20(${roll}) + 调查 ${c.exploreBonus} = ${total} / DC ${q.dc}：${success ? '成功' : '失败'}。` +
      (q.id === 'research' ? `研究消耗一瓶药水，${success ? '制成两瓶' : '未制成药水'}，现有 ${c.potions} 瓶。` : q.id === 'caravan' && success ? '找到并收下待交付的商队货物。' : q.id === 'survey' ? '依据已走过的遗迹地面记录绘图。' : '未取得可交付货物。'), undefined,
      { quest: q.id, roll, total, success, stage: 'followup', due: sim.world.quests[q.id].due });
  }
  function followup(sim, q) {
    const state = sim.world.quests[q.id], c = sim.character, npc = sim.world.npcs[q.receiver];
    let gold = state.branch === 'success' ? q.reward : state.branch === 'failure' ? 2 : 0;
    let detail = '';
    if (q.id === 'caravan' && state.branch === 'success') {
      if (c.inventory.some(i => i.id === 'caravanCargo')) { c.inventory = c.inventory.filter(i => i.id !== 'caravanCargo'); detail = '已交付背包中的商队货物。'; }
      else { gold = 0; detail = '货物不在背包中，未支付货物报酬。'; }
    }
    if (q.id === 'favor' && state.branch === 'borrowed') {
      const pay = c.gold >= 8;
      if (pay) c.gold -= 8;
      sim.world.flags.innDebt = 0; detail = pay ? '归还 8 金币，欠款清零。' : '金币不足，在旅馆劳动两小时偿还人情，欠款清零。';
      sim.time(pay ? 10 : 120, pay ? 0 : 4);
    } else sim.time(15);
    c.gold += gold; state.stage = 'complete'; state.completedAt = sim.world.minutes;
    if (q.id === 'threat') sim.world.flags.roadThreat = state.branch === 'success' ? 'cleared' : 'unresolved';
    if (q.id === 'survey') sim.world.flags.guildMap = state.branch === 'success';
    if (q.id === 'research' && state.branch === 'success') sim.world.flags.alchemyTrust = true;
    const relation = state.branch === 'success' || state.branch === 'borrowed' ? 8 : state.branch === 'declined' ? -2 : 1;
    memory(sim, q.receiver, `${q.title}：已回访，结果 ${state.branch}`, relation);
    sim.remember('resolved-' + q.id, `${q.title}：在之后的日子回访${npc.name}`);
    sim.record('quest-followup', q.title, `在场的${npc.name}回应此前行动（${state.branch}）。${detail}${gold ? `支付 ${gold} 金币。` : '没有额外金币报酬。'}关系 ${relation > 0 ? '+' : ''}${relation}。`, undefined,
      { quest: q.id, branch: state.branch, gold, npc: npc.id, relationship: npc.relationship, completedAt: state.completedAt });
    sim.intention('回访完成', `${q.title}已按此前行动结算，不会重复领取奖励。`);
  }
  function tryTown(sim) {
    install(sim.world);
    for (const q of DEFINITIONS) {
      const state = sim.world.quests[q.id];
      if (state.stage === 'followup' && sim.world.minutes >= state.due && present(sim, q.receiver)) { followup(sim, q); return true; }
      if (state.stage === 'offer' && prerequisites(sim, q) && present(sim, q.giver)) { offer(sim, q); return true; }
      if (state.stage === 'active' && present(sim, q.giver) &&
        ((q.objective === 'map' && sim.dungeon?.explorer.visited.size >= 20) || (q.objective === 'potion' && sim.character.potions > 0))) { investigate(sim, q); return true; }
    }
    // A bounded appointment wait prevents missing every evening NPC forever.
    if (sim.world.npcWaitDay !== sim.world.clock.day && sim.character.fatigue < 65) {
      const appointment = DEFINITIONS.find(q => {
        const s = sim.world.quests[q.id];
        const receiver = s.stage === 'followup' ? q.receiver : q.giver;
        const canArrive = receiver !== 'merchant' || (sim.world.flags.merchantChoice && sim.world.minutes >= sim.world.flags.merchantDue);
        return canArrive && ((s.stage === 'followup' && sim.world.minutes >= s.due) || (s.stage === 'offer' && q.giver === 'mage' && prerequisites(sim, q)));
      });
      if (appointment) {
        const receiver = sim.world.npcs[sim.world.quests[appointment.id].stage === 'followup' ? appointment.receiver : appointment.giver];
        const opening = receiver.id === 'mage' ? 18 : receiver.id === 'merchant' ? 9 : 8;
        const target = Math.floor(sim.world.minutes / 1440) * 1440 + opening * 60;
        const wait = target > sim.world.minutes ? target - sim.world.minutes : target + 1440 - sim.world.minutes;
        sim.world.npcWaitDay = sim.world.clock.day; sim.time(wait, 1);
        sim.record('decision', '等待约定时间', `在安全小镇等待 ${wait} 分钟，准备向${receiver.name}询问或回访；没有提前结算奖励。`);
        sim.intention('等待在场的委托人', '已知 NPC 有开放时间，每天至多等待一次，随后继续实际互动。'); return true;
      }
    }
    return false;
  }
  function tryForest(sim, D) {
    for (const q of DEFINITIONS) {
      const state = sim.world.quests[q.id];
      if (state.stage !== 'active') continue;
      if (q.objective === 'forest') { investigate(sim, q); return true; }
      if (q.objective === 'combat') {
        const enemy = { ...D.SKELETON_STATS, hp: 14, maxHp: 14, id: 1, name: '盗匪哨兵', ...sim.character.position };
        sim.fieldCombat = new D.Encounters([enemy], () => sim.random.next(), sim.character);
        sim.fieldCombat.battle = { target: enemy, turn: 'hero', round: 1 }; state.stage = 'combat'; sim.time(5);
        sim.record('battle', q.title, '调查道路时遇见一名盗匪哨兵，进入真实回合战斗；胜负尚未确定。'); return true;
      }
    }
    return false;
  }
  function battleResult(sim, name, victory) {
    if (name === '盗匪哨兵' && sim.world.quests.threat.stage === 'combat') finishLater(sim, DEFINITIONS.find(q => q.id === 'threat'), victory ? 'success' : 'failure');
  }
  function legacyStarted(sim, id) {
    if (id === 'merchant') sim.world.npcs.merchant.location = { ...sim.character.position, venue: '受伤商人歇脚处' };
  }
  function legacyResult(sim, id) {
    if (id === 'merchant_return') memory(sim, 'merchant', sim.world.flags.merchantChoice === 'help' ? '记得冒险者救助了自己' : '记得冒险者未提供救助', sim.world.flags.merchantChoice === 'help' ? 15 : -8);
  }
  function validate(world) {
    if (world.npcs === undefined && world.quests === undefined) return true;
    if (!world.npcs || !world.quests) return false;
    return NPCS.every(({ id }) => {
      const n = world.npcs[id];
      return n && n.id === id && typeof n.name === 'string' && Number.isFinite(n.relationship) && Math.abs(n.relationship) <= 100 &&
        Array.isArray(n.memories) && n.memories.length <= 24 && n.memories.every(m => Number.isFinite(m.time) && typeof m.text === 'string') &&
        n.location && ['town', 'forest'].includes(n.location.region) && Number.isInteger(n.location.x) && Number.isInteger(n.location.y) &&
        n.location.x >= 0 && n.location.x < 21 && n.location.y >= 0 && n.location.y < 21 && typeof n.available === 'boolean';
    }) && DEFINITIONS.every(({ id }) => {
      const s = world.quests[id];
      return s && ['offer', 'active', 'combat', 'followup', 'complete'].includes(s.stage) && Number.isFinite(s.due) && s.due >= 0 &&
        (s.branch === null || ['success', 'failure', 'declined', 'borrowed'].includes(s.branch));
    });
  }
  const api = { DEFINITIONS, NPCS, install, sync, present, tryTown, tryForest, battleResult, legacyStarted, legacyResult, validate };
  root.LivingWorld = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
