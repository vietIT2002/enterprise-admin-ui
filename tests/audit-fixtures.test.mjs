// Runs audit.js in Chromium at 1440×900 on every page in tests/fixtures/ and compares the rules it reports with the
// rules the page declares. Each fixture states what it expects in its <head>:
//
//   <meta name="audit-page-type" content="list">                      the pageType option ("" for none)
//   <meta name="audit-expect" content="numeric-align tabular-nums">   the violated rules, exactly ("" for a clean page)
//
// Uses Playwright's Chromium (`npx playwright install chromium`), or an installed Google Chrome when that is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { ROOT } from '../tools/build-adapters.mjs';

const AUDIT = join(ROOT, 'skills/enterprise-admin-ui/scripts/audit.js');
const FIXTURES = join(ROOT, 'tests/fixtures');

const require = createRequire(import.meta.url);
require(AUDIT);
const RULES = globalThis.enterpriseAdminAudit.rules;

function meta(html, name, file) {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)">`));
  if (!m) throw new Error(`${file}: missing <meta name="${name}" content="…">`);
  return m[1].trim();
}

const fixtures = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((file) => {
    const html = readFileSync(join(FIXTURES, file), 'utf8');
    const expected = meta(html, 'audit-expect', file).split(/\s+/).filter(Boolean).sort();
    for (const rule of expected) if (!RULES.includes(rule)) throw new Error(`${file}: "${rule}" is not an audit rule`);
    return { file, pageType: meta(html, 'audit-page-type', file) || null, expected };
  });

let browser;

before(async () => {
  try {
    browser = await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) throw err;
    try {
      browser = await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new Error('No browser for the fixture tests. Run: npx playwright install chromium (or install Google Chrome).\n' + err.message);
    }
  }
});

after(async () => {
  if (browser) await browser.close();
});

for (const { file, pageType, expected } of fixtures) {
  test(`fixture ${file} (pageType: ${pageType})`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(pathToFileURL(join(FIXTURES, file)).href);
      await page.addScriptTag({ path: AUDIT });
      const result = await page.evaluate((type) => enterpriseAdminAudit({ pageType: type }), pageType);
      const actual = result.violations.map((v) => v.rule).sort();
      assert.deepEqual(actual, expected, `${file}: expected [${expected.join(' ')}], got [${actual.join(' ')}]\n${result.summary}`);
      if (!expected.length) assert.equal(result.score, 100);
    } finally {
      await page.close();
    }
  });
}

test('every audit rule fails on at least one fixture, and at least one fixture is clean', () => {
  const covered = new Set(fixtures.flatMap((f) => f.expected));
  assert.deepEqual(RULES.filter((rule) => !covered.has(rule)), [], 'rules without a failing fixture');
  assert.ok(fixtures.some((f) => !f.expected.length), 'a fixture that expects no violations');
});
