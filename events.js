/* 事件内容是数据；条件检查与掷骰不会直接修改世界。 */
(function (root) {
  'use strict';
  const option = (id, label, traits, effects, extra = {}) => ({ id, label, traits, effects, base: 15, ...extra });
  const event = (id, title, description, locations, actions, extra = {}) =>
    ({ id, title, description, locations, actions, weight: 2, minutes: 15, ...extra });
  const EVENTS = [
    event('merchant', '受伤的旅行商人', '一位旅行商人坐在倒下的路牌旁，手臂伤口仍在渗血。', ['forest'], [
      option('help', '购买布料为商人包扎', { kindness: 65, caution: 5 }, { flags: { merchantChoice: 'help', merchantDue: { after: 120 } }, memory: 'helpedMerchant' }, { cost: { gold: 2 } }),
      option('potion', '赠送一瓶治疗药水', { kindness: 75 }, { flags: { merchantChoice: 'help', merchantDue: { after: 120 } }, memory: 'helpedMerchant' }, { cost: { potions: 1 } }),
      option('ignore', '留下路标，继续前行', { caution: 25, greed: 15 }, { flags: { merchantChoice: 'ignore', merchantDue: { after: 120 } }, memory: 'ignoredMerchant' })
    ], { weight: 5 }),
    event('merchant_return', '小镇里的再次相遇', '先前那位受伤商人已经来到小镇，认出了冒险者。', ['town'], [
      option('greet', '上前问候商人', { kindness: 20 }, {})
    ], { when: 'merchantDue', weight: 100 }),
    event('purse', '遗失的钱袋', '树根旁有一个缝着商旅标记的钱袋。', ['forest'], [
      option('return', '送到道路上的失物箱', { kindness: 55, caution: 10 }, { gold: 3, memory: 'honest' }),
      option('take', '收下钱袋', { greed: 55, courage: 5 }, { gold: 12, memory: 'keptPurse' })
    ]),
    event('wagon', '废弃的马车', '倾覆的马车中还留有一只被木板压住的箱子。', ['forest'], [
      option('search', '调查残骸', { curiosity: 35, greed: 25, courage: 10 }, {}, { risk: .25, check: { dc: 11, success: { gold: 8, item: { id: 'cloth', name: '商旅布料', value: 5 } }, failure: { hp: -4, fatigue: 5, memory: 'injured' } } }),
      option('leave', '避开残骸', { caution: 30 }, { fatigue: -1 })
    ]),
    event('altar', '苔藓祭坛', '石坛上仍有一道微弱的暖光，铭文已经模糊。', ['forest'], [
      option('study', '解读祭坛并尝试触碰', { curiosity: 45, kindness: 20 }, {}, { risk: .25, check: { dc: 10, success: { hp: 8, memory: 'altarBlessing' }, failure: { hp: -3, memory: 'injured' } } }),
      option('leave', '谨慎离开', { caution: 35 }, {})
    ]),
    event('bandits', '林间盗匪', '一名持短刀的盗匪拦住道路，索要过路费。', ['forest'], [
      option('fight', '抵抗盗匪', { courage: 45, greed: 15 }, { combat: 'bandit' }, { risk: .65 }),
      option('pay', '支付过路费', { caution: 40 }, { memory: 'paidBandit' }, { cost: { gold: 5 } }),
      option('evade', '寻找机会绕开', { caution: 25, curiosity: 15 }, {}, { risk: .2, check: { dc: 10, success: { memory: 'escapedBandit' }, failure: { hp: -5, fatigue: 5, memory: 'injured' } } })
    ]),
    event('traveler', '迷路的旅行者', '一名旅行者对照着破损地图，无法辨认回镇道路。', ['forest'], [
      option('guide', '花些时间指明方向', { kindness: 50, curiosity: 10 }, { gold: 4, fatigue: 3, memory: 'helpedTraveler' }),
      option('leave', '只留下一个方向标记', { caution: 15, greed: 15 }, { memory: 'markedRoad' })
    ]),
    event('stele', '古代石碑', '路旁的石碑记录着通往遗迹的道路与退路。', ['forest'], [
      option('read', '抄录石碑', { curiosity: 50, caution: 25 }, { knowledge: 'ruins', flags: { safePassage: true }, memory: 'safePassage' }),
      option('leave', '继续赶路', { courage: 10, greed: 5 }, {})
    ]),
    event('supply', '隐藏的补给箱', '灌木下露出巡路人留下的补给箱，封口尚完整。', ['forest'], [
      option('share', '取一瓶药水，留下其他补给', { kindness: 30, caution: 25 }, { potions: 1, memory: 'sharedSupply' }),
      option('take', '收下药水和可售补给', { greed: 45 }, { potions: 1, item: { id: 'provisions', name: '密封补给', value: 6 } })
    ]),
    event('elixir', '神秘药剂', '一只封蜡玻璃瓶落在草中，瓶身没有清晰标签。', ['forest'], [
      option('drink', '尝试少量药剂', { curiosity: 40, courage: 20 }, {}, { risk: .4, check: { dc: 12, success: { hp: 10, fatigue: -10 }, failure: { hp: -6, memory: 'badElixir' } } }),
      option('collect', '保留封瓶，带回小镇出售', { caution: 30, greed: 20 }, { item: { id: 'elixir', name: '封蜡药剂', value: 7 } })
    ]),
    event('peddler', '可疑的流浪商贩', '一名商贩声称自己的护符来自古代遗迹。', ['forest'], [
      option('buy', '买下护符', { greed: 20, curiosity: 40 }, {}, { cost: { gold: 6 }, check: { dc: 12, success: { item: { id: 'amulet', name: '古铜护符', value: 12 } }, failure: { item: { id: 'fake', name: '普通铜片', value: 1 }, memory: 'deceived' } } }),
      option('refuse', '拒绝交易', { caution: 45 }, {})
    ]),
    event('cursed_chest', '被诅咒的宝箱', '铁箱上的黑色刻痕与周围石砖格格不入。', ['ruins'], [
      option('open', '尝试打开铁箱', { greed: 50, curiosity: 25, courage: 15 }, {}, { risk: .55, check: { dc: 13, success: { gold: 16, item: { id: 'silver', name: '银饰残片', value: 10 } }, failure: { hp: -8, fatigue: 12, gold: 4, memory: 'cursedChest' } } }),
      option('seal', '标记危险，放弃开启', { caution: 50 }, { memory: 'sealedChest' })
    ]),
    event('hidden_room', '遗迹中的隐藏房间', '断墙后露出一间狭小的侧室，墙上仍挂着旧徽章。', ['ruins'], [
      option('search', '检查侧室', { curiosity: 45, greed: 25 }, {}, { risk: .2, check: { dc: 10, success: { gold: 10, item: { id: 'relic', name: '旧王国徽章', value: 14 }, memory: 'foundRelic' }, failure: { hp: -3, gold: 3, memory: 'injured' } } }),
      option('leave', '记录位置后离开', { caution: 30 }, { memory: 'markedRoom' })
    ]),
    event('ancient_cache', '遗迹补给匣', '入口守卫留下的旧补给匣中，还有未破损的药瓶。', ['ruins'], [
      option('open', '打开补给匣', { curiosity: 30, caution: 25 }, { potions: 1, gold: 6 })
    ])
  ];

  class EventEngine {
    eligible(definition, context) {
      if (context.done[definition.id] || !definition.locations.includes(context.region)) return false;
      return !definition.when || (context.flags.merchantChoice && context.time >= context.flags.merchantDue);
    }
    available(definition, context) {
      return definition.actions.filter(a => Object.entries(a.cost || {}).every(([key, value]) => context[key] >= value));
    }
    select(context, random) {
      const pool = EVENTS.filter(e => !['cursed_chest', 'hidden_room', 'ancient_cache'].includes(e.id) && this.eligible(e, context));
      if (!pool.length) return null;
      let roll = random() * pool.reduce((sum, e) => sum + e.weight, 0);
      return pool.find(e => (roll -= e.weight) < 0) || pool[pool.length - 1];
    }
    resolve(definition, action, context, random) {
      if (!this.eligible(definition, context) || !this.available(definition, context).includes(action)) throw new Error('事件或行动的前置条件未满足');
      let effects = { ...action.effects }, check = null;
      if (action.check) {
        const roll = 1 + Math.floor(random() * 20);
        const total = roll + context.exploreBonus;
        const success = total >= action.check.dc;
        check = { roll, total, dc: action.check.dc, success, bonus: context.exploreBonus };
        effects = { ...effects, ...(success ? action.check.success : action.check.failure) };
      }
      if (definition.id === 'merchant_return') effects = context.flags.merchantChoice === 'help'
        ? { gold: 14, flags: { merchantDiscount: true }, memory: 'merchantGrateful' }
        : { memory: 'merchantDisappointed' };
      return { effects, cost: action.cost || {}, check };
    }
  }
  const api = { EVENTS, EventEngine };
  root.AdventureEvents = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
