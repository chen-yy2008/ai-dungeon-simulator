// Fail closed: inspect only approved files, never print matched secret contents.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const forbidden = /(^|\/)(node_modules|test-output|coverage|browser-profile|user-data|User Data|\.tools|\.local|\.ssh|\.aws|__pycache__|\.pytest_cache|\.cache|\.vscode|\.idea)(\/|$)|(^|\/)(\.env(?:\..*)?|credentials\.json|secrets\.json|Cookies(?:-journal)?|Login Data(?:-journal)?|Local State|Web Data(?:-journal)?)$|\.(zip|7z|tar|gz|pem|key|p12|pfx|keystore|pyc|tmp|temp|bak|log|save\.json)$/i;
const secretPatterns = [/gh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/, /(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'][A-Za-z0-9_+\/=-]{24,}["']/i];

function git(args, allowFailure = false) {
  const result = spawnSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, '-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (allowFailure) return '';
    throw new Error(`Git inspection failed (${args[0]}).`);
  }
  return result.stdout;
}
function scan(label, data) {
  if (secretPatterns.some(pattern => pattern.test(data.toString('utf8')))) throw new Error(`Possible secret found in ${label}; contents withheld.`);
}
function main() {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version) || release.branch !== 'main' ||
      !Array.isArray(release.files) || new Set(release.files).size !== release.files.length) throw new Error('Invalid release manifest.');
  for (const file of release.files) {
    if (!/^[\p{L}\p{N}_.\/-]+$/u.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '..' || p === '.') || forbidden.test(file)) throw new Error(`Unapproved release path: ${file}`);
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) {
      if (!git(['ls-files', '--', file]).trim()) throw new Error(`Missing release file: ${file}`);
      continue; // Explicitly listed, previously tracked deletion.
    }
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) throw new Error(`Unsafe file type/size: ${file}`);
    const data = fs.readFileSync(absolute);
    if (file.endsWith('.png')) {
      if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Invalid PNG demo asset: ${file}`);
    } else if (data.includes(0)) throw new Error(`Unexpected binary/UTF-16 source file: ${file}; convert reviewed text to UTF-8.`);
    scan(file, data);
  }
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  for (const file of tracked) if (forbidden.test(file) || !release.files.includes(file)) throw new Error(`Tracked file not approved: ${file}`);
  const changes = [...git(['diff', '--name-only', '-z']).split('\0'), ...git(['diff', '--cached', '--name-only', '-z']).split('\0'),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean);
  for (const file of changes) if (!release.files.includes(file)) throw new Error(`Unreviewed change: ${file}; update the approved manifest only after review.`);
  // .gitignore does not erase history. Inspect reachable local AND fetched remote objects.
  const objects = git(['rev-list', '--objects', '--all']).trim().split('\n').filter(Boolean);
  const seen = new Set(); let checked = 0;
  for (const entry of objects) {
    const match = /^([a-f0-9]{40,64}) (.+)$/.exec(entry);
    if (!match) continue;
    const [, sha, name] = match;
    if (forbidden.test(name)) throw new Error(`Sensitive/generated path exists in Git history: ${name}. Ignoring it is insufficient.`);
    if (seen.has(sha) || git(['cat-file', '-t', sha]).trim() !== 'blob') continue;
    seen.add(sha);
    if (Number(git(['cat-file', '-s', sha]).trim()) > 5 * 1024 * 1024) throw new Error(`History blob too large for review: ${name}`);
    {
      const result = spawnSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, '-C', root, 'cat-file', 'blob', sha], { windowsHide: true, maxBuffer: 6 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(`Cannot inspect history: ${name}`);
      scan(`history ${name}`, result.stdout); checked++;
    }
  }
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const section = changelog.split(`## [${release.version}]`)[1]?.split('\n## [')[0];
  if (!section || !['新增', '改进', '修复', '已知局限'].every(title => section.includes(`### ${title}`))) throw new Error('Current CHANGELOG section is incomplete.');
  for (const ignored of ['.env', '.tools/gh/bin/gh.exe', 'test-output/browser-profile/Default/Cookies', 'archive.zip', '__pycache__/sample.pyc']) {
    if (!git(['check-ignore', '--no-index', '--', ignored], true).trim()) throw new Error(`Ignore rule missing: ${ignored}`);
  }
  console.log(`Release inspection passed: v${release.version}, ${release.files.length} approved paths, ${checked} history blobs. Secret contents were never printed.`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
