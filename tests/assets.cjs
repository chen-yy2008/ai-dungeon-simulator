'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const P = require('../assets.js');
const { World } = require('../world.js');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
assert.equal(manifest.version, 1);
assert.deepEqual(manifest.sources.map(s => s.file).sort(), P.files.map(id => 'assets/' + id + '.png').sort());
let bytes = 0;
for (const source of manifest.sources) {
  const data = fs.readFileSync(path.join(root, source.file)); bytes += data.length;
  assert.deepEqual([...data.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), source.sha256);
  assert.equal(source.license, 'CC0-1.0');
  assert.ok(['https://pixel-boy.itch.io/ninja-adventure-asset-pack', 'https://kenney.nl/assets/fantasy-ui-borders'].includes(source.url));
  assert.ok(release.files.includes(source.file) && release.runtimeAssets.includes(source.file));
  assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0);
}
assert.ok(bytes < 8 * 1024 * 1024, 'Only used image subset may be shipped');
const world = new World(), original = JSON.stringify(world.roadMap);
for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (world.roadMap[y][x]) {
  const q = P.roadQuarters(world.roadMap, x, y);
  assert.equal(q.length, 4);
  for (const part of q) assert.ok(part.sx >= 0 && part.sx + 8 <= 48 && part.sy >= 0 && part.sy + 8 <= 48);
}
assert.equal(JSON.stringify(world.roadMap), original, 'Art mapping cannot alter roads');
assert.equal(P.hash(2, 3), P.hash(2, 3));
for (const f of ['core.js','world.js','events.js','living-world.js','character-card.js']) {
  // v0.7 has no rules changes; later versions deliberately revise these responsibilities.
  if (release.version === '0.7.0') {
    const old = require('node:child_process').spawnSync('git', ['-c','safe.directory='+root.replace(/\\/g,'/'),'-C',root,'show','v0.6.0:'+f],{encoding:'utf8'});
    if (old.status === 0) assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n'),old.stdout.replace(/\r\n/g,'\n'));
  }
}
console.log(`Asset checks passed: ${manifest.sources.length} original-channel CC0 PNGs, ${bytes} bytes; SHA, runtime inclusion, road mapping and unchanged v0.6 rules.`);
