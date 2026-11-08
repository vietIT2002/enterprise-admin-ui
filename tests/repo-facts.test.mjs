// The numbers and names the READMEs, manifests and CHANGELOG state must match the files they describe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../tools/build-adapters.mjs';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n?/g, '\n');
const json = (path) => JSON.parse(read(path));
const all = (text, re) => Array.from(text.matchAll(re), (m) => m[1]);

const SKILL_DIR = 'skills/enterprise-admin-ui';
const skill = read(`${SKILL_DIR}/SKILL.md`);
require(join(ROOT, SKILL_DIR, 'scripts/audit.js'));

const facts = {
  references: readdirSync(join(ROOT, SKILL_DIR, 'references')).filter((f) => f.endsWith('.md')).sort(),
  skillLines: skill.split('\n').length - (skill.endsWith('\n') ? 1 : 0),
  rules: globalThis.enterpriseAdminAudit.rules.length,
  antiPatterns: (() => {
    const text = read(`${SKILL_DIR}/references/anti-patterns.md`);
    const entries = text.slice(text.indexOf('\n## Entries'), text.indexOf('\n## ', text.indexOf('\n## Entries') + 1));
    return all(entries, /^### (\S+)/gm).length;
  })(),
  version: all(read('CHANGELOG.md'), /^## \[(\d+\.\d+\.\d+)\]/gm)[0],
};

// Per README: where it states each number. Every pattern must match at least once, and every match must agree.
const READMES = {
  'README.md': {
    skillLines: /SKILL\.md`?\s+(?:is\s+)?(\d+) lines/g,
    references: /references\/\s+(\d+) files/g,
    rules: /audit\.js\s+.*?(\d+) rules/g,
    antiPatterns: /(\d+) "AI template" tells/g,
  },
  'README.vi.md': {
    skillLines: /SKILL\.md`?\s+(?:dài\s+)?(\d+) dòng/g,
    references: /references\/\s+(\d+) file/g,
    rules: /audit\.js\s+.*?(\d+) quy tắc/g,
    antiPatterns: /(\d+) dấu hiệu "template AI"/g,
  },
  'README.zh-CN.md': {
    skillLines: /SKILL\.md`?\s+(?:共\s+)?(\d+) 行/g,
    references: /references\/\s+(\d+) 个文件/g,
    rules: /audit\.js\s+.*?(\d+) 条规则/g,
    antiPatterns: /(\d+) 个“AI 模板”痕迹/g,
  },
};
const BADGES = {
  references: /badge\/references-(\d+)-/g,
  rules: /badge\/audit%20rules-(\d+)-/g,
  version: /badge\/version-(\d+\.\d+\.\d+)-/g,
};

test('the measured facts look sane', () => {
  assert.ok(facts.references.length > 0 && facts.skillLines > 0 && facts.rules > 0 && facts.antiPatterns > 0, JSON.stringify(facts));
  assert.ok(facts.version, 'CHANGELOG has a released version');
});

for (const [file, patterns] of Object.entries(READMES)) {
  test(`${file} states the current numbers`, () => {
    const text = read(file);
    const expected = { skillLines: facts.skillLines, references: facts.references.length, rules: facts.rules, antiPatterns: facts.antiPatterns, version: facts.version };
    for (const [fact, re] of Object.entries({ ...patterns, ...BADGES })) {
      const found = all(text, re);
      assert.ok(found.length > 0, `${file}: no match for ${fact} (${re})`);
      for (const value of found) assert.equal(value, String(expected[fact]), `${file}: ${fact} says ${value}, the files say ${expected[fact]}`);
    }
  });

  test(`${file} lists every reference file`, () => {
    const section = read(file).split('\n').filter((line) => /^\| `[a-z-]+\.md` \|/.test(line));
    assert.deepEqual(all(section.join('\n'), /^\| `([a-z-]+\.md)` \|/gm).sort(), facts.references);
  });
}

test('SKILL.md: front matter follows the Agent Skills format', () => {
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, 'front matter');
  const name = front[1].match(/^name: (.+)$/m)?.[1];
  const description = front[1].match(/^description: (.+)$/m)?.[1];
  assert.equal(name, 'enterprise-admin-ui', 'name matches the folder');
  assert.match(name, /^[a-z0-9-]{1,64}$/);
  assert.ok(description && description.length <= 1024, `description is 1–1024 characters (${description?.length})`);
});

test('SKILL.md: the References table lists every reference file', () => {
  assert.deepEqual(all(skill, /^\| `references\/([a-z-]+\.md)` \|/gm).sort(), facts.references);
});

test('SKILL.md: every file it names under references/, assets/ or scripts/ exists', () => {
  const names = new Set(all(skill, /`((?:references|assets|scripts)\/[\w.-]+\.\w+)`/g));
  for (const name of names) assert.doesNotThrow(() => readFileSync(join(ROOT, SKILL_DIR, name)), name);
});

test('SKILL.md and every README name each file in scripts/ and assets/', () => {
  const shipped = ['scripts', 'assets'].flatMap((dir) => readdirSync(join(ROOT, SKILL_DIR, dir)).map((f) => `${dir}/${f}`));
  for (const file of ['SKILL.md', ...Object.keys(READMES)]) {
    const text = file === 'SKILL.md' ? skill : read(file);
    for (const path of shipped) {
      const name = path.startsWith('assets/') && file !== 'SKILL.md' ? path.slice('assets/'.length) : path; // README trees nest assets
      assert.ok(text.includes(name), `${file} does not mention ${name}`);
    }
  }
});

test('plugin manifests agree on name and version', () => {
  const agentPlugin = json('plugin.json');
  const claudePlugin = json('.claude-plugin/plugin.json');
  const claudeMarket = json('.claude-plugin/marketplace.json');
  const codexMarket = json('.agents/plugins/marketplace.json');
  assert.equal(agentPlugin.version, facts.version, 'plugin.json version is the latest CHANGELOG release');
  assert.equal(claudePlugin.version, facts.version, '.claude-plugin/plugin.json version is the latest CHANGELOG release');
  for (const name of [agentPlugin.name, claudePlugin.name, claudeMarket.plugins[0].name, codexMarket.plugins[0].name]) assert.equal(name, 'enterprise-admin-ui');
});

test('CHANGELOG: every release has a link to its tag', () => {
  const text = read('CHANGELOG.md');
  for (const version of all(text, /^## \[(\d+\.\d+\.\d+)\]/gm)) {
    assert.match(text, new RegExp(`^\\[${version.replace(/\./g, '\\.')}\\]: https://github\\.com/vietIT2002/enterprise-admin-ui/releases/tag/v${version.replace(/\./g, '\\.')}$`, 'm'), version);
  }
});
