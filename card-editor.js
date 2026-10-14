/* 表单只编辑角色设定；确认创建由 UI 控制层负责。 */
(function (root) {
  'use strict';
  class CardEditor {
    constructor(card, get) {
      this.card = card; this.get = get;
      this.inputs('ability-editor', card.ABILITIES.map(k => [k, k, 3, 20, 10]));
      this.inputs('behavior-editor', [['riskTolerance', '冒险意愿', 0, 100, 50], ['altruism', '助人倾向', 0, 100, 50], ['discipline', '自律程度', 0, 100, 50]]);
      get('import-card').addEventListener('click', () => {
        try { const data = card.parse(get('card-json').value); this.fill(data); get('class-input').dispatchEvent(new Event('card-import'));
          get('card-notice').textContent = '格式合法，已填写表单；当前冒险没有改变。点击创建才会开始新的冒险。';
        } catch (error) { get('card-notice').textContent = error.message; }
      });
      get('export-editor').addEventListener('click', () => {
        try { this.download(this.read()); get('card-notice').textContent = '已导出设定 JSON，不包含当前金币、HP、世界标记或存档。'; }
        catch (error) { get('card-notice').textContent = error.message; }
      });
    }
    inputs(parent, fields) {
      this.get(parent).replaceChildren(...fields.map(([key, name, min, max, value]) => {
        const label = document.createElement('label'), input = document.createElement('input');
        label.textContent = name; input.id = 'card-' + key; input.type = 'number'; input.min = min; input.max = max; input.value = value; input.required = true;
        label.append(input); return label;
      }));
    }
    defaults(classId) {
      const c = this.card.fromConfig({ classId });
      this.card.ABILITIES.forEach(k => { this.get('card-' + k).value = c.abilities[k]; });
    }
    read() {
      const g = this.get, number = key => Number(g(key).value);
      const split = (id, pattern) => g(id).value.split(pattern).map(v => v.trim()).filter(Boolean);
      return this.card.normalize({ schema: 'ai-dungeon-character', version: 1, name: g('name-input').value, classId: g('class-input').value,
        identity: g('identity-input').value, background: g('background-input').value, level: number('level-input'),
        abilities: Object.fromEntries(this.card.ABILITIES.map(k => [k, number('card-' + k)])),
        traits: Object.fromEntries(this.card.TRAITS.map(k => [k, number(k)])),
        behavior: Object.fromEntries(this.card.BEHAVIOR.map(k => [k, number('card-' + k)])),
        goal: g('goal-input').value, values: split('values-input', /[,，]/), weaknesses: split('weaknesses-input', /[,，]/),
        shortGoal: g('shortGoal-input').value, longGoal: g('longGoal-input').value,
        basicAbilities: split('basicAbilities-input', /\r?\n/), importantMemories: split('importantMemories-input', /\r?\n/) });
    }
    fill(data) {
      const g = this.get;
      for (const key of ['name', 'classId', 'goal']) g({ name: 'name-input', classId: 'class-input', goal: 'goal-input' }[key]).value = data[key];
      for (const key of ['identity', 'background', 'level', 'shortGoal', 'longGoal']) g(key + '-input').value = data[key];
      for (const key of this.card.TRAITS) { g(key).value = data.traits[key]; g(key + '-value').textContent = data.traits[key]; }
      for (const key of this.card.ABILITIES) g('card-' + key).value = data.abilities[key];
      for (const key of this.card.BEHAVIOR) g('card-' + key).value = data.behavior[key];
      for (const key of ['values', 'weaknesses', 'basicAbilities', 'importantMemories']) g(key + '-input').value = data[key].join(['values', 'weaknesses'].includes(key) ? '，' : '\n');
    }
    download(data) {
      const json = JSON.stringify(this.card.normalize(data), null, 2), url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'ai-dungeon-character.json'; document.body.append(link); link.click(); link.remove();
      // 下一帧释放，不增加模拟计时器。
      requestAnimationFrame(() => URL.revokeObjectURL(url));
    }
  }
  root.CardEditor = CardEditor;
})(globalThis);
