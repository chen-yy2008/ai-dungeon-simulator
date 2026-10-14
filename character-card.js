/* 纯角色设定数据接口：JSON 只描述角色，不接受运行资源或执行代码。 */
(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' && module.exports ? require('./progression.js') : root.FateRules;
  const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const TRAITS = ['courage', 'caution', 'greed', 'kindness', 'curiosity'];
  const BEHAVIOR = ['riskTolerance', 'altruism', 'discipline'];
  const VALUES = ['探索', '财富', '责任', '同情', '自由', '知识'];
  const WEAKNESSES = ['畏惧亡灵', '体力不足', '冲动', '不善交际'];
  const DEFAULTS = { warrior: [16, 12, 14, 10, 12, 10], rogue: [10, 16, 12, 12, 14, 10], mage: [8, 12, 12, 16, 14, 10] };
  const KEYS = ['schema', 'version', 'name', 'classId', 'identity', 'background', 'level', 'abilities', 'traits', 'values', 'behavior', 'goal', 'shortGoal', 'longGoal', 'basicAbilities', 'weaknesses', 'importantMemories'];
  const fail = message => { throw new Error('角色卡：' + message); };
  function object(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) fail(label + '字段缺失或包含不支持的字段');
  }
  function string(value, max, label, required = false) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || required && !value.trim()) fail(label + '文本不合法或过长');
    return value.trim();
  }
  function number(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) fail(label + `须为 ${min}～${max} 的整数`);
    return value;
  }
  function list(value, max, label, allowed) {
    if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(label + '列表无效');
    const result = value.map(v => { const text = string(v, 160, label, true); if (allowed && !allowed.includes(text)) fail(label + '包含未知选项'); return text; });
    if (new Set(result).size !== result.length) fail(label + '包含重复项');
    return result;
  }
  function normalize(data) {
    object(data, data?.version === 2 ? [...KEYS,'patronId'] : KEYS, '模型');
    if (data.schema !== 'ai-dungeon-character' || ![1,2].includes(data.version)) fail('不支持此格式版本；请使用 schema=ai-dungeon-character、version=1 或 2');
    if (!Object.hasOwn(DEFAULTS, data.classId) || !['explore', 'wealth', 'survive'].includes(data.goal)) fail('职业或目标无效');
    if(data.version===2&&data.patronId!==F.PATRONS[data.classId].id) fail('神明必须与职业绑定');
    object(data.abilities, ABILITIES, '六维'); object(data.traits, TRAITS, '性格'); object(data.behavior, BEHAVIOR, '行为');
    return { schema: data.schema, version: 2, patronId: F.PATRONS[data.classId].id, name: string(data.name, 24, '姓名', true), classId: data.classId,
      identity: string(data.identity, 80, '身份'), background: string(data.background, 1000, '背景'), level: number(data.level, 1, 20, '等级'),
      abilities: Object.fromEntries(ABILITIES.map(k => [k, number(data.abilities[k], 3, 20, k)])),
      traits: Object.fromEntries(TRAITS.map(k => [k, number(data.traits[k], 0, 100, k)])),
      values: list(data.values, 6, '价值观', VALUES), behavior: Object.fromEntries(BEHAVIOR.map(k => [k, number(data.behavior[k], 0, 100, k)])),
      goal: data.goal, shortGoal: string(data.shortGoal, 160, '短期愿望'), longGoal: string(data.longGoal, 160, '长期愿望'),
      basicAbilities: list(data.basicAbilities, 12, '能力描述'), weaknesses: list(data.weaknesses, 4, '弱点', WEAKNESSES),
      importantMemories: list(data.importantMemories, 20, '背景记忆') };
  }
  function fromConfig(config = {}) {
    if (config.card) return normalize(config.card);
    const classId = Object.hasOwn(DEFAULTS, config.classId) ? config.classId : 'warrior';
    return normalize({ schema: 'ai-dungeon-character', version: 1, name: config.name || '艾尔文', classId,
      identity: '', background: '', level: config.level || 1,
      abilities: config.abilities || Object.fromEntries(ABILITIES.map((k, i) => [k, DEFAULTS[classId][i]])),
      traits: { courage: 60, caution: 55, greed: 45, kindness: 65, curiosity: 70, ...config.traits },
      values: [], behavior: { riskTolerance: 50, altruism: 50, discipline: 50 }, goal: config.goal || 'explore',
      shortGoal: '', longGoal: '', basicAbilities: [], weaknesses: [], importantMemories: [] });
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 65536) fail('文件过大（上限 64 KB）');
    let data; try { data = JSON.parse(text); } catch { fail('JSON 语法错误，当前冒险未改变'); }
    return normalize(data);
  }
  function exportCharacter(character) {
    const card = fromConfig({ card: character.profile });
    card.importantMemories = [...new Set([...card.importantMemories, ...character.memories.slice(-10).map(m => m.note.replace(/^角色背景：/, '').slice(0, 160))])].slice(-20);
    return normalize(card);
  }
  const api = { ABILITIES, TRAITS, BEHAVIOR, VALUES, WEAKNESSES, normalize, fromConfig, parse, exportCharacter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CharacterCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
