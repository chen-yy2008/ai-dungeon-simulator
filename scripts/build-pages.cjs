'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function argument(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
const source = path.resolve(argument('--source', path.join(__dirname, '..')));
const output = path.resolve(argument('--output', path.join(source, 'test-output', 'pages-site')));
const release = JSON.parse(fs.readFileSync(path.join(source, 'release.json'), 'utf8'));
const tag = process.env.DEPLOY_TAG;
if (tag && tag !== 'v' + release.version) throw new Error('Tag and release.json version mismatch');
const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const assets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
const files = [...new Set(['index.html', ...assets, ...(release.runtimeAssets || [])])];
fs.mkdirSync(output, { recursive: true });
// Refuse reuse containing unrelated files; no recursive deletion of user directories.
const existing = fs.readdirSync(output,{recursive:true}).filter(name=>fs.lstatSync(path.join(output,name)).isFile());
for (const name of existing) if (![...files,'version.json','.nojekyll'].includes(name.replace(/\\/g,'/'))) throw new Error('Output contains unrelated data');
for (const file of files) {
  if (!/^(?:[A-Za-z0-9_-]+\.(?:html|js|css)|assets\/(?:[a-z0-9-]+\.png|licenses\/[a-z0-9-]+\.txt))$/.test(file) || !release.files.includes(file)) throw new Error(`Unapproved runtime asset: ${file}`);
  const input = path.join(source, file);
  if (!fs.lstatSync(input).isFile() || fs.lstatSync(input).isSymbolicLink()) throw new Error('Unsafe asset');
  fs.mkdirSync(path.dirname(path.join(output,file)),{recursive:true});
  fs.copyFileSync(input, path.join(output, file));
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
const metadata = { version: release.version };
if (tag) {
  const result = spawnSync('git', ['-c', 'safe.directory=' + source.replace(/\\/g, '/'), '-C', source, 'rev-parse', tag + '^{commit}'], {encoding:'utf8'});
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(result.stdout.trim())) throw new Error('Cannot verify tagged source commit');
  metadata.sourceCommit = result.stdout.trim();
}
fs.writeFileSync(path.join(output, 'version.json'), JSON.stringify(metadata) + '\n');
console.log(`Pages artifact: ${release.version}; ${files.length} runtime files only. No profiles, docs or credentials copied.`);
