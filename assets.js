/* 原作者 CC0 图集清单。仅加载一次，普通脚本兼容 file://。 */
(function (root) {
  'use strict';
  const files = ['field', 'nature', 'town', 'stone-floor', 'stone-wall', 'props',
    'knight', 'hunter', 'sorcererblack', 'skeleton', 'villager', 'noble', 'woman',
    'knight-portrait', 'hunter-portrait', 'sorcererblack-portrait', 'coin', 'potion', 'book', 'bag', 'dice', 'card-frame'];
  const heroes = { warrior: 'knight', rogue: 'hunter', mage: 'sorcererblack' };
  const hash = (x, y) => ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0);
  function roadQuarters(grid, x, y) {
    return [0, 1].flatMap(qy => [0, 1].map(qx => ({ qx, qy,
      sx: (grid[y]?.[x + (qx ? 1 : -1)] ? 16 : qx ? 32 : 0) + qx * 8,
      sy: (grid[y + (qy ? 1 : -1)]?.[x] ? 16 : qy ? 32 : 0) + qy * 8 })));
  }
  const api = { files, heroes, hash, roadQuarters, images: {}, status: 'loading', errors: [] };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PixelAssets = api;
  api.ready = Promise.all(files.map(id => new Promise(resolve => {
    const image = new Image(); api.images[id] = image;
    image.onload = () => resolve(true);
    image.onerror = () => { api.errors.push(id); resolve(false); };
    image.src = 'assets/' + id + '.png';
  }))).then(results => {
    api.status = results.every(Boolean) ? 'ready' : 'failed';
    document.dispatchEvent(new Event('pixel-assets-ready'));
    return api.status;
  });
})(globalThis);
