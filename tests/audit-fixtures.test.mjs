// Runs audit.js in Chromium at 1440×900 on every page in tests/fixtures/ and compares the rules it reports with the
// rules the page declares (see tests/fixture-pages.mjs for the <meta> format).
//
// Uses Playwright's Chromium (`npx playwright install chromium`), or an installed Google Chrome when that is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { AUDIT, RULES, loadFixtures } from './fixture-pages.mjs';

const fixtures = loadFixtures();

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

for (const { file, path, pageType, expected } of fixtures) {
  test(`fixture ${file} (pageType: ${pageType})`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(pathToFileURL(path).href);
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

test('shipped list template: the pager passes the pagination rule', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.route((url) => url.hostname === 'cdn.tailwindcss.com', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    const template = fileURLToPath(new URL('../skills/enterprise-admin-ui/assets/templates/list.html', import.meta.url));
    await page.goto(pathToFileURL(template).href);
    await page.waitForFunction(() => document.getElementById('page-range')?.textContent.trim());
    await page.addScriptTag({ path: AUDIT });
    const result = await page.evaluate(() => enterpriseAdminAudit({ pageType: 'list' }));
    assert.deepEqual(result.violations.filter((v) => v.rule === 'pagination'), []);
    assert.equal(result.metrics.applicable.pagination, 1);
  } finally {
    await page.close();
  }
});

test('list-pager-arrows: the pagination finding names both gaps, and script text is not a total', async () => {
  const fixture = fixtures.find((f) => f.file === 'list-pager-arrows.html');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(pathToFileURL(fixture.path).href);
    await page.addScriptTag({ path: AUDIT });
    const result = await page.evaluate(() => enterpriseAdminAudit({ pageType: 'list' }));
    const v = result.violations.find((x) => x.rule === 'pagination');
    assert.equal(v.examples[0].actual, 'no range or total; no page size next to the pager');
  } finally {
    await page.close();
  }
});

test('pager fixtures are measured, not clean because nothing was found', async () => {
  for (const file of ['list-pager-ant.html', 'list-pager-mui4.html', 'list-pager-tfoot.html']) {
    const fixture = fixtures.find((f) => f.file === file);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(pathToFileURL(fixture.path).href);
      await page.addScriptTag({ path: AUDIT });
      const result = await page.evaluate(() => enterpriseAdminAudit({ pageType: 'list' }));
      assert.equal(result.metrics.applicable.pagination, 1, `${file}: pagination not measured`);
      assert.deepEqual(result.violations.filter((v) => v.rule === 'pagination'), [], file);
    } finally {
      await page.close();
    }
  }
});
