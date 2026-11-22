// Fixture part of the consistency evaluation: the five-page "AI-made" attendance admin in
// tests/agent-eval/consistency/fixture/. Asserts DOM facts directly (the variants listed in
// tests/agent-eval/consistency/FIXTURE.md), not through the grader.
//
// Uses Playwright's Chromium (`npx playwright install chromium`), or an installed Google Chrome when that is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PAGES as GRADER_PAGES, consistency, detectorsOf, functionKept, grade, signatures } from './agent-eval/consistency/grade.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'tests', 'agent-eval', 'consistency', 'fixture');
const AUDIT = join(ROOT, 'skills', 'enterprise-admin-ui', 'scripts', 'audit.js');
const KNOWN_NAME = 'Nguyễn Văn An';

const PAGES = {
  employees: { type: 'list', total: 48, search: true },
  timesheets: { type: 'list', total: 120, search: true },
  'leave-requests': { type: 'list', total: 36, search: true },
  reports: { type: 'report', total: 12, search: false },
  settings: { type: 'settings', total: 0, search: false },
};
const TABLE_PAGES = ['employees', 'timesheets', 'leave-requests', 'reports'];
const LIST_PAGES = ['employees', 'timesheets', 'leave-requests'];

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

async function open(name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('request', (r) => {
    if (!/^(file|data|about|blob):/.test(r.url())) problems.push('network: ' + r.url());
  });
  await page.goto(pathToFileURL(join(FIXTURE, name + '.html')).href);
  return { page, problems };
}

async function withPage(name, fn) {
  const { page, problems } = await open(name);
  try {
    await fn(page);
    assert.deepEqual(problems, [], `${name}: console errors or network requests`);
  } finally {
    await page.close();
  }
}

const bodyRows = (page) => page.locator('tbody tr').count();
const searchBox = (page) => page.locator('input[type="search"], input[role="searchbox"]').first();

// Sum the rows of every page of a list, through its own pagination.
async function totalRows(page, pagination) {
  let sum = 0;
  if (pagination === 'numbered') {
    const buttons = page.locator('.pager button.num');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      await buttons.nth(i).click();
      sum += await bodyRows(page);
    }
  } else if (pagination === 'prev-next') {
    sum += await bodyRows(page);
    while (await page.locator('.pager button.next:not([disabled])').count()) {
      await page.locator('.pager button.next').click();
      sum += await bodyRows(page);
    }
  } else if (pagination === 'load-more') {
    while (await page.locator('.load-more:visible').count()) await page.locator('.load-more').click();
    sum = await bodyRows(page);
  } else {
    sum = await bodyRows(page);
  }
  return sum;
}

const PAGINATION = { employees: 'numbered', timesheets: 'prev-next', 'leave-requests': 'load-more', reports: 'none', settings: 'none' };

for (const [name, spec] of Object.entries(PAGES)) {
  test(`${name}: loads clean, no network, row count ${spec.total}`, async () => {
    await withPage(name, async (page) => {
      if (spec.type === 'settings') {
        assert.equal(await page.locator('table').count(), 0, 'settings has no table');
        return;
      }
      assert.ok((await bodyRows(page)) > 0, 'shows data rows');
      assert.equal(await totalRows(page, PAGINATION[name]), spec.total);
    });
  });
}

for (const name of LIST_PAGES) {
  test(`${name}: search narrows the rows to the known name`, async () => {
    await withPage(name, async (page) => {
      const box = searchBox(page);
      assert.equal(await box.count(), 1);
      await box.fill(KNOWN_NAME);
      const rows = page.locator('tbody tr');
      const n = await rows.count();
      assert.ok(n >= 1 && n < spec(name).total, `${name}: ${n} rows after search`);
      for (let i = 0; i < n; i++) assert.match(await rows.nth(i).innerText(), new RegExp(KNOWN_NAME));
      await box.fill('zzzz-không-có');
      assert.equal(await bodyRows(page), 0);
    });
  });
}

function spec(name) {
  return PAGES[name];
}

test('settings: at least 3 labelled fields, validates, saves to local state', async () => {
  await withPage('settings', async (page) => {
    const labelled = await page.evaluate(() =>
      [...document.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), select, textarea')].filter((el) => el.labels && el.labels.length).length
    );
    assert.ok(labelled >= 3, `labelled fields: ${labelled}`);
    assert.equal(await page.locator('.saved:visible').count(), 0, 'no saved message at first');
    // invalid: end before start
    await page.fill('#start', '17:00');
    await page.fill('#end', '08:00');
    await page.click('button[type=submit]');
    assert.ok(await page.locator('[role=alert]:visible').count(), 'an error shows');
    assert.equal(await page.evaluate(() => window.savedSettings || null), null);
    await page.fill('#start', '08:30');
    await page.fill('#end', '17:30');
    await page.fill('#grace', '10');
    await page.click('button[type=submit]');
    const saved = await page.evaluate(() => window.savedSettings);
    assert.equal(saved.start, '08:30');
    assert.equal(saved.end, '17:30');
    assert.equal(saved.grace, 10);
    assert.ok(await page.locator('.saved:visible').count(), 'a saved message shows');
  });
});

test('leave-requests: Approve changes a status', async () => {
  await withPage('leave-requests', async (page) => {
    await page.locator('.chips button', { hasText: 'Chờ duyệt' }).click();
    const row = page.locator('tbody tr').first();
    const code = await row.getAttribute('data-code');
    assert.ok(code);
    await row.locator('button[data-action="approve"]').click();
    await page.locator('.chips button', { hasText: 'Tất cả' }).click();
    await page.locator('#more').click();
    await page.locator('#more').click();
    const status = await page.locator(`tbody tr[data-code="${code}"] .badge`).innerText();
    assert.equal(status, 'Đã duyệt');
  });
});

test('pagination pages: second page differs from the first', async () => {
  for (const [name, selector] of [['employees', '.pager button.num >> nth=1'], ['timesheets', '.pager button.next']]) {
    await withPage(name, async (page) => {
      const first = await page.locator('tbody tr').first().innerText();
      await page.locator(selector).click();
      assert.notEqual(await page.locator('tbody tr').first().innerText(), first);
    });
  }
});

// ---- variants, as listed in FIXTURE.md ------------------------------------------------------------------------

async function paginationKinds(page) {
  return page.evaluate(() => {
    const kinds = new Set();
    const root = document.querySelector('main');
    const text = root.innerText;
    if (/\d+[–-]\d+ (of|trên|\/) \d+/.test(text)) kinds.add('range-text');
    const buttons = [...root.querySelectorAll('.pager button, button')];
    if ([...document.querySelectorAll('.pager button')].some((b) => /^\d+$/.test(b.textContent.trim()))) kinds.add('numbered');
    if (buttons.some((b) => /^(‹ )?trước$|^previous$|^prev$/i.test(b.textContent.trim())) && buttons.some((b) => /^sau( ›)?$|^next$/i.test(b.textContent.trim()))) kinds.add('prev-next');
    if (buttons.some((b) => /xem thêm|load more/i.test(b.textContent))) kinds.add('load-more');
    if (root.querySelector('select[aria-label*="dòng"], select.page-size')) kinds.add('page-size-select');
    return [...kinds].sort();
  });
}

test('variant: pagination', async () => {
  const expected = {
    employees: ['numbered', 'range-text'],
    timesheets: ['page-size-select', 'prev-next'],
    'leave-requests': ['load-more'],
    reports: [],
    settings: [],
  };
  for (const name of Object.keys(PAGES)) {
    await withPage(name, async (page) => {
      assert.deepEqual(await paginationKinds(page), expected[name], name);
    });
  }
});

test('variant: filter bar', async () => {
  const expected = {
    employees: { search: 'left', kind: 'select' },
    timesheets: { search: 'right', kind: 'panel-button' },
    'leave-requests': { search: 'left', kind: 'chips' },
    reports: { search: 'none', kind: 'select' },
  };
  for (const [name, want] of Object.entries(expected)) {
    await withPage(name, async (page) => {
      const got = await page.evaluate(() => {
        const table = document.querySelector('table').getBoundingClientRect();
        const box = document.querySelector('input[type="search"]');
        let search = 'none';
        if (box) {
          const r = box.getBoundingClientRect();
          search = r.left + r.width / 2 < table.left + table.width / 2 ? 'left' : 'right';
        }
        const bar = document.querySelector('.filters');
        let kind = 'none';
        if (bar.querySelector('.chips button')) kind = 'chips';
        else if (bar.querySelector('button.filter-toggle')) kind = 'panel-button';
        else if (bar.querySelector('select')) kind = 'select';
        return { search, kind };
      });
      assert.deepEqual(got, want, name);
    });
  }
  await withPage('timesheets', async (page) => {
    assert.equal(await page.locator('#panel:visible').count(), 0, 'panel closed at first');
    await page.locator('button.filter-toggle').click();
    assert.equal(await page.locator('#panel:visible').count(), 1);
  });
});

test('variant: page header', async () => {
  const expected = {
    employees: { tag: 'H1', size: 28, action: 'header-right', breadcrumb: false },
    timesheets: { tag: 'H1', size: 24, action: 'below-title', breadcrumb: false },
    'leave-requests': { tag: 'H1', size: 32, action: 'header-right', breadcrumb: true },
    reports: { tag: 'H1', size: 26, action: 'none', breadcrumb: true },
    settings: { tag: 'H1', size: 22, action: 'none', breadcrumb: false },
  };
  for (const [name, want] of Object.entries(expected)) {
    await withPage(name, async (page) => {
      const got = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const hr = h1.getBoundingClientRect();
        const head = h1.closest('header') || h1.parentElement;
        const btn = head.querySelector('.page-action');
        let action = 'none';
        if (btn) {
          const b = btn.getBoundingClientRect();
          action = b.top >= hr.bottom - 2 ? 'below-title' : 'header-right';
        }
        return {
          tag: h1.tagName,
          size: parseFloat(getComputedStyle(h1).fontSize),
          action,
          breadcrumb: !!document.querySelector('nav[aria-label="Breadcrumb"], nav[aria-label="breadcrumb"]'),
        };
      });
      assert.deepEqual(got, want, name);
    });
  }
});

const hue = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1; // grey
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((h * 60 + 360) % 360) / 20) * 20;
};

async function badgeMap(page) {
  return page.evaluate(() => {
    const map = {};
    for (const el of document.querySelectorAll('tbody .badge')) map[el.textContent.trim()] = getComputedStyle(el).backgroundColor;
    return map;
  });
}

test('variant: status badges share a status text between pages with a different colour', async () => {
  const maps = {};
  for (const name of LIST_PAGES) await withPage(name, async (page) => (maps[name] = await badgeMap(page)));
  for (const name of LIST_PAGES) {
    const others = LIST_PAGES.filter((n) => n !== name);
    const shared = others.flatMap((o) => Object.keys(maps[name]).filter((s) => s in maps[o]).map((s) => [o, s]));
    assert.ok(shared.length, `${name} shares a status text with another page`);
    for (const [o, s] of shared) assert.notEqual(maps[name][s], maps[o][s], `${s}: ${name} vs ${o}`);
  }
  assert.ok('Nghỉ phép' in maps.employees && 'Nghỉ phép' in maps.timesheets);
  assert.ok('Chờ duyệt' in maps.timesheets && 'Chờ duyệt' in maps['leave-requests']);
  assert.ok('Đã duyệt' in maps.timesheets && 'Đã duyệt' in maps['leave-requests']);
});

test('variant: dates', async () => {
  const classes = { employees: 'dd/mm/yyyy', timesheets: 'iso', 'leave-requests': 'month-name' };
  const patterns = { 'dd/mm/yyyy': /^\d{2}\/\d{2}\/\d{4}$/, iso: /^\d{4}-\d{2}-\d{2}$/, 'month-name': /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/ };
  for (const [name, cls] of Object.entries(classes)) {
    await withPage(name, async (page) => {
      const cells = await page.locator('tbody td').allInnerTexts();
      const found = new Set();
      for (const t of cells.map((c) => c.trim())) for (const [k, re] of Object.entries(patterns)) if (re.test(t)) found.add(k);
      assert.deepEqual([...found], [cls], name);
    });
  }
  await withPage('reports', async (page) => {
    const cells = (await page.locator('tbody td').allInnerTexts()).map((c) => c.trim());
    assert.ok(!cells.some((t) => Object.values(patterns).some((re) => re.test(t))), 'reports has no date cells');
  });
});

test('variant: table rows differ on every table page (height bucket and font size)', async () => {
  const rows = {};
  for (const name of TABLE_PAGES) {
    await withPage(name, async (page) => {
      rows[name] = await page.evaluate(() => {
        const tr = document.querySelector('tbody tr');
        return { bucket: Math.round(tr.getBoundingClientRect().height / 4) * 4, font: parseFloat(getComputedStyle(tr.querySelector('td')).fontSize) };
      });
    });
  }
  const buckets = TABLE_PAGES.map((n) => rows[n].bucket);
  const fonts = TABLE_PAGES.map((n) => rows[n].font);
  assert.equal(new Set(buckets).size, TABLE_PAGES.length, JSON.stringify(rows));
  assert.equal(new Set(fonts).size, TABLE_PAGES.length, JSON.stringify(rows));
});

test('variant: empty states differ', async () => {
  const want = {
    employees: { text: true, icon: false, svg: false, button: false },
    timesheets: { text: true, icon: true, svg: false, button: false },
    'leave-requests': { text: true, icon: false, svg: true, button: true },
  };
  for (const [name, w] of Object.entries(want)) {
    await withPage(name, async (page) => {
      await searchBox(page).fill('zzzz-không-có');
      const got = await page.evaluate(() => {
        const e = document.querySelector('.empty');
        return { text: !!e && e.innerText.trim().length > 0, icon: !!(e && e.querySelector('.eico')), svg: !!(e && e.querySelector('svg')), button: !!(e && e.querySelector('button')) };
      });
      assert.deepEqual(got, w, name);
    });
  }
  await withPage('leave-requests', async (page) => {
    await searchBox(page).fill('zzzz-không-có');
    await page.locator('.empty button').click();
    assert.ok((await bodyRows(page)) > 0, 'the empty-state button clears the filter');
  });
});

// ---- tells ---------------------------------------------------------------------------------------------------

test('tells: every counted tell on at least 2 pages, every page carries at least 3', async () => {
  const audit = readFileSync(AUDIT, 'utf8');
  const perPage = {};
  for (const [name, spec] of Object.entries(PAGES)) {
    await withPage(name, async (page) => {
      await page.addScriptTag({ content: audit });
      const result = await page.evaluate((type) => enterpriseAdminAudit({ pageType: type }), spec.type);
      const tells = new Set(result.violations.map((v) => v.rule).filter((r) => ['no-gradient', 'no-backdrop-blur', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold'].includes(r)));
      const extra = await page.evaluate(() => {
        const out = [];
        if ([...document.querySelectorAll('h1, h2')].some((h) => /welcome|chào|good morning/i.test(h.textContent))) out.push('greeting-header');
        const hues = new Set([...document.querySelectorAll('tbody .badge')].map((b) => getComputedStyle(b).backgroundColor));
        window.__badgeColours = [...hues];
        const circle = [...document.querySelectorAll('tbody tr td:first-child *')].some((e) => {
          const s = getComputedStyle(e);
          return /^\p{L}{1,2}$/u.test(e.textContent.trim()) && parseFloat(s.borderRadius) >= e.getBoundingClientRect().width / 2 - 1 && e.getBoundingClientRect().width > 0;
        });
        if (circle) out.push('initials-avatar-non-person');
        return { out, colours: window.__badgeColours };
      });
      for (const t of extra.out) tells.add(t);
      if (new Set(extra.colours.map(hue).filter((h) => h >= 0)).size >= 5) tells.add('rainbow-status');
      perPage[name] = tells;
    });
  }
  // initials-avatar-non-person: only pages whose first column is not a person count
  for (const person of ['employees']) perPage[person].delete('initials-avatar-non-person');
  const counts = {};
  for (const tells of Object.values(perPage)) for (const t of tells) counts[t] = (counts[t] || 0) + 1;
  for (const rule of ['no-gradient', 'no-backdrop-blur', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold', 'greeting-header', 'rainbow-status', 'initials-avatar-non-person']) {
    assert.ok((counts[rule] || 0) >= 2, `${rule} on ${counts[rule] || 0} page(s): ${JSON.stringify(Object.fromEntries(Object.entries(perPage).map(([k, v]) => [k, [...v]])))}`);
  }
  for (const [name, tells] of Object.entries(perPage)) assert.ok(tells.size >= 3, `${name} has ${tells.size} tells: ${[...tells]}`);
});

test('shared navigation: the same sidebar on every page, linking all five', async () => {
  const html = {};
  for (const name of Object.keys(PAGES)) {
    const src = readFileSync(join(FIXTURE, name + '.html'), 'utf8');
    const m = src.match(/<aside class="sidebar">[\s\S]*?<\/aside>/);
    assert.ok(m, `${name} has the sidebar`);
    html[name] = m[0].replace(/ aria-current="page"/, '');
    for (const target of Object.keys(PAGES)) assert.ok(m[0].includes(`href="${target}.html"`), `${name} links ${target}`);
  }
  assert.equal(new Set(Object.values(html)).size, 1, 'sidebar markup is identical apart from aria-current');
});

// ---------------------------------------------------------------------------------------------------------------
// Grader part: signatures, consistency, function kept. Expected values are literal, from FIXTURE.md.
// ---------------------------------------------------------------------------------------------------------------
const FILES = Object.keys(GRADER_PAGES);

async function sigOfFile(file) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(pathToFileURL(file).href);
    return await signatures(page);
  } finally {
    await page.close();
  }
}

async function sigOfHtml(html) {
  const dir = mkdtempSync(join(tmpdir(), 'grade-variant-'));
  try {
    const file = join(dir, 'v.html');
    writeFileSync(file, html);
    return await sigOfFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fixtureSigs = {};
async function fixtureSignatures() {
  if (!Object.keys(fixtureSigs).length) for (const f of FILES) fixtureSigs[f] = await sigOfFile(join(FIXTURE, f));
  return fixtureSigs;
}

test('grader: PAGES has the five page types', () => {
  assert.deepEqual(GRADER_PAGES, {
    'employees.html': 'list',
    'timesheets.html': 'list',
    'leave-requests.html': 'list',
    'reports.html': 'report',
    'settings.html': 'settings',
  });
});

test('grader: signatures of the fixture match the planned variants', async () => {
  const s = await fixtureSignatures();
  const e = s['employees.html'];
  assert.deepEqual(e.pagination, { kinds: ['numbered', 'range-text'], position: 'below' });
  assert.deepEqual(e.filterBar, { search: 'left', control: 'select' });
  assert.deepEqual(e.pageHeader, { tag: 'h1', fontSize: 28, action: 'header-right', breadcrumb: false });
  assert.deepEqual(e.dateFormat, { formats: ['dd/mm/yyyy'] });
  assert.equal(e.tableRow.height, 72);
  assert.equal(e.tableRow.fontSize, 14);
  assert.equal(e.statusBadge['Đang làm'], '#dcfce7');
  assert.equal(e.statusBadge['Thử việc'], '#dbeafe');
  assert.equal(e.statusBadge['Nghỉ phép'], '#f3e8ff');

  const t = s['timesheets.html'];
  assert.deepEqual(t.pagination, { kinds: ['page-size-select', 'prev-next'], position: 'below' });
  assert.deepEqual(t.filterBar, { search: 'right', control: 'panel-button' });
  assert.deepEqual(t.pageHeader, { tag: 'h1', fontSize: 24, action: 'below-title', breadcrumb: false });
  assert.deepEqual(t.dateFormat, { formats: ['iso'] });
  assert.ok(t.tableRow.rawHeight >= 28 && t.tableRow.rawHeight <= 32, 'timesheets row height ' + t.tableRow.rawHeight);
  assert.equal(t.tableRow.fontSize, 12);
  assert.equal(t.statusBadge['Nghỉ phép'], '#bfdbfe');
  assert.equal(t.statusBadge['Chờ duyệt'], '#fef08a');
  assert.equal(t.statusBadge['Đã duyệt'], '#99f6e4');

  const l = s['leave-requests.html'];
  assert.deepEqual(l.pagination, { kinds: ['load-more'], position: 'below' });
  assert.deepEqual(l.filterBar, { search: 'left', control: 'chips' });
  assert.deepEqual(l.pageHeader, { tag: 'h1', fontSize: 32, action: 'header-right', breadcrumb: true });
  assert.deepEqual(l.dateFormat, { formats: ['month-name'] });
  assert.equal(l.tableRow.height, 60);
  assert.equal(l.tableRow.fontSize, 15);
  assert.equal(l.statusBadge['Chờ duyệt'], '#fed7aa');
  assert.equal(l.statusBadge['Đã duyệt'], '#bbf7d0');

  const r = s['reports.html'];
  assert.equal(r.pagination, null);
  assert.deepEqual(r.filterBar, { search: 'none', control: 'select' });
  assert.deepEqual(r.pageHeader, { tag: 'h1', fontSize: 26, action: 'none', breadcrumb: true });
  assert.equal(r.dateFormat, null);
  assert.equal(r.statusBadge, null);
  assert.equal(r.tableRow.height, 48);
  assert.equal(r.tableRow.fontSize, 13);

  const g = s['settings.html'];
  assert.deepEqual(g.pageHeader, { tag: 'h1', fontSize: 22, action: 'none', breadcrumb: false });
  for (const k of ['pagination', 'filterBar', 'statusBadge', 'dateFormat', 'tableRow']) assert.equal(g[k], null, `settings ${k}`);
});

test('grader: the fixture scores 0 of 6 and lists the variant per page', async () => {
  const c = consistency(await fixtureSignatures());
  assert.deepEqual(c.score, { consistent: 0, of: 6 });
  assert.deepEqual(Object.keys(c.patterns), ['pagination', 'filterBar', 'pageHeader', 'statusBadge', 'dateFormat', 'tableRow']);
  assert.deepEqual(c.patterns.pagination.present, ['employees.html', 'timesheets.html', 'leave-requests.html']);
  assert.deepEqual(c.patterns.filterBar.present, ['employees.html', 'timesheets.html', 'leave-requests.html', 'reports.html']);
  assert.equal(c.patterns.pageHeader.present.length, 5);
  assert.deepEqual(c.patterns.statusBadge.present, ['employees.html', 'timesheets.html', 'leave-requests.html']);
  assert.deepEqual(c.patterns.dateFormat.present, ['employees.html', 'timesheets.html', 'leave-requests.html']);
  assert.deepEqual(c.patterns.tableRow.present, ['employees.html', 'timesheets.html', 'leave-requests.html', 'reports.html']);
  for (const p of Object.values(c.patterns)) assert.equal(p.consistent, false);
});

test('grader: consistency counts agreement (synthetic signatures)', () => {
  const pag = { kinds: ['numbered'], position: 'below' };
  const sig = (over) => ({ pagination: null, filterBar: null, pageHeader: null, statusBadge: null, dateFormat: null, tableRow: null, ...over });
  const c = consistency({
    'a.html': sig({ pagination: pag, statusBadge: { 'Chờ duyệt': '#fef08a', Vắng: '#fecaca' }, tableRow: { height: 48, rawHeight: 47, fontSize: 14 } }),
    'b.html': sig({ pagination: pag, statusBadge: { 'chờ duyệt': '#fef08b' }, tableRow: { height: 48, rawHeight: 48, fontSize: 14 } }),
    'c.html': sig({ pagination: { kinds: ['load-more'], position: 'below' }, statusBadge: { 'Đã duyệt': '#000000' } }),
    'd.html': sig({ dateFormat: { formats: ['iso'] } }),
  });
  assert.equal(c.patterns.pagination.consistent, false);
  assert.equal(c.patterns.statusBadge.consistent, true, 'shared statuses agree within tolerance; c shares none');
  assert.equal(c.patterns.tableRow.consistent, true);
  assert.equal(c.patterns.dateFormat.counted, false, 'present on one page only: not scored');
  assert.deepEqual(c.score, { consistent: 2, of: 3 });
});

// ---- equivalent markup gives equal signatures (Decisions item 1) ------------------------------------------------
const rowsHtml = '<tr><td>Nguyễn Văn An</td><td>2026-11-02</td></tr><tr><td>Trần Bình</td><td>2026-11-03</td></tr><tr><td>Lê Cường</td><td>2026-11-04</td></tr>';
const shell = (filters, after) =>
  `<!doctype html><meta charset="utf-8"><title>x</title><body style="margin:0"><main><h1>Danh sách</h1><section class="card">${filters}<table style="width:100%"><thead><tr><th>Tên</th><th>Ngày</th></tr></thead><tbody>${rowsHtml}</tbody></table>${after}</section></main></body>`;

test('grader: icon-only Prev/Next by accessible name equals text Prev/Next', async () => {
  const text = await sigOfHtml(shell('', '<div><button>Trước</button><button>Sau</button></div>'));
  const english = await sigOfHtml(shell('', '<div><button>Previous</button><button>Next</button></div>'));
  const icons = await sigOfHtml(shell('', '<nav><button aria-label="Previous page"><svg width="12" height="12"><path d="M8 1L2 6l6 5"/></svg></button><button aria-label="Next page"><svg width="12" height="12"><path d="M4 1l6 5-6 5"/></svg></button></nav>'));
  const chevrons = await sigOfHtml(shell('', '<div><button>‹</button><button>›</button></div>'));
  assert.deepEqual(text.pagination, { kinds: ['prev-next'], position: 'below' });
  assert.deepEqual(english.pagination, text.pagination);
  assert.deepEqual(icons.pagination, text.pagination);
  assert.deepEqual(chevrons.pagination, text.pagination);
});

test('grader: chips as buttons, links and role=tab give the same filter bar', async () => {
  const search = '<input type="search" aria-label="Tìm" style="width:200px">';
  const buttons = await sigOfHtml(shell(`<div>${search}<div role="group"><button aria-pressed="true">All</button><button aria-pressed="false">Pending</button><button aria-pressed="false">Done</button></div></div>`, ''));
  const links = await sigOfHtml(shell(`<div>${search}<div><a href="#all" class="chip active">All</a><a href="#p" class="chip">Pending</a><a href="#d" class="chip">Done</a></div></div>`, ''));
  const tabs = await sigOfHtml(shell(`<div>${search}<div role="tablist"><button role="tab" aria-selected="true">All</button><button role="tab" aria-selected="false">Pending</button><button role="tab" aria-selected="false">Done</button></div></div>`, ''));
  assert.deepEqual(buttons.filterBar, { search: 'left', control: 'chips' });
  assert.deepEqual(links.filterBar, buttons.filterBar);
  assert.deepEqual(tabs.filterBar, buttons.filterBar);
});

test('grader: range text anywhere in the table container, English or Vietnamese', async () => {
  const vi = await sigOfHtml(shell('', '<div><span>Hiển thị 1–10 trên 48 nhân viên</span><button>1</button><button>2</button></div>'));
  const en = await sigOfHtml(shell('<p class="meta">Showing 1-10 of 48 results</p>', '<div><button>1</button><button>2</button></div>'));
  const slash = await sigOfHtml(shell('', '<div><button>1</button><button>2</button><em>1 - 10 / 48</em></div>'));
  assert.deepEqual(vi.pagination.kinds, ['numbered', 'range-text']);
  assert.deepEqual(en.pagination.kinds, ['numbered', 'range-text']);
  assert.deepEqual(slash.pagination.kinds, ['numbered', 'range-text']);
});

test('grader: a page without a table, and a blank or closed page, give nulls and never throw', async () => {
  const none = await sigOfHtml('<!doctype html><title>x</title><body><p>hi</p></body>');
  assert.deepEqual(none, { pagination: null, filterBar: null, pageHeader: null, statusBadge: null, dateFormat: null, tableRow: null });
  const page = await browser.newPage();
  await page.goto('about:blank');
  assert.deepEqual(Object.values(await signatures(page)), [null, null, null, null, null, null]);
  await page.close();
  assert.ok(Object.values(await signatures(page)).every((v) => v && typeof v.error === 'string'), 'a closed page does not throw; every pattern is an error, not null');
});

// ---- function kept -----------------------------------------------------------------------------------------------
test('functionKept: passes every fixture page', async () => {
  const had = { 'employees.html': [true, true], 'timesheets.html': [true, true], 'leave-requests.html': [true, true], 'reports.html': [false, false], 'settings.html': [false, false] };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    for (const f of FILES) {
      const r = await functionKept(page, join(FIXTURE, f), { hadSearch: had[f][0], hadPagination: had[f][1] });
      assert.deepEqual(r, { ok: true, problems: [], evidence: [] }, f);
    }
  } finally {
    await page.close();
  }
});

test('functionKept: rows removed, search box removed, pagination removed, file missing, fields removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-broken-'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const emp = join(dir, 'employees.html');
    writeFileSync(emp, readFileSync(emp, 'utf8').replace(/const DATA = \[.*\];/, 'const DATA = [];'));
    let r = await functionKept(page, emp, { hadSearch: true, hadPagination: false });
    assert.equal(r.ok, false);
    assert.ok(r.problems.includes('no data rows'), r.problems.join('|'));

    const ts = join(dir, 'timesheets.html');
    writeFileSync(ts, readFileSync(ts, 'utf8').replace(/<input type="search"[^>]*>/, ''));
    r = await functionKept(page, ts, { hadSearch: true, hadPagination: true });
    assert.equal(r.ok, false);
    assert.ok(r.problems.includes('pattern lost: search'), r.problems.join('|'));

    const lv = join(dir, 'leave-requests.html');
    writeFileSync(lv, readFileSync(lv, 'utf8').replace(/<div class="more">.*<\/div>/, ''));
    r = await functionKept(page, lv, { hadSearch: true, hadPagination: true });
    assert.ok(r.problems.includes('pattern lost: pagination'), r.problems.join('|'));

    r = await functionKept(page, join(dir, 'nope.html'), { hadSearch: true, hadPagination: true });
    assert.deepEqual(r, { ok: false, problems: ['page missing'], evidence: [] });

    const st = join(dir, 'settings.html');
    writeFileSync(st, readFileSync(st, 'utf8').replace(/<form[\s\S]*<\/form>/, ''));
    r = await functionKept(page, st, { hadSearch: false, hadPagination: false });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /fewer than 3 labelled fields/.test(p)), r.problems.join('|'));
  } finally {
    await page.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Grader fix round 1: pages rewritten by agents.
// ---------------------------------------------------------------------------------------------------------------
const hexOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'grade-fix-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A list page named employees.html with a search box whose behaviour is given by `script`.
const searchPage = (script) =>
  `<!doctype html><meta charset="utf-8"><title>x</title><body><main><h1>Nhân viên</h1><section class="card"><input type="search" id="q" aria-label="Tìm nhân viên"><table style="width:100%"><thead><tr><th>Tên</th></tr></thead><tbody id="b"><tr><td>Nguyễn Văn An</td></tr><tr><td>Trần Bình</td></tr><tr><td>Lê Cường</td></tr><tr><td>Phạm Dung</td></tr></tbody></table></section></main><script>
const q = document.getElementById('q');
const apply = () => { for (const tr of document.querySelectorAll('#b tr')) tr.style.display = !q.value || tr.textContent.includes(q.value) ? '' : 'none'; };
${script}
</script></body>`;

test('fix 1: search that is debounced, needs Enter, or does nothing', async () => {
  await withTempDir(async (dir) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const run = async (script) => {
        const f = join(dir, 'employees.html');
        writeFileSync(f, searchPage(script));
        return functionKept(page, f, { hadSearch: true, hadPagination: false });
      };
      let r = await run("let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 300); });");
      assert.deepEqual(r.problems, [], 'debounced 300 ms');
      r = await run("q.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });");
      assert.deepEqual(r.problems, [], 'filters on Enter only');
      r = await run("q.addEventListener('input', () => setTimeout(apply, 900));");
      assert.deepEqual(r.problems, [], 'async 900 ms');
      r = await run('/* search box that does nothing */');
      assert.ok(r.problems.some((p) => /search does not narrow/.test(p)), r.problems.join('|'));
      // the box is cleared afterwards
      const f = join(dir, 'employees.html');
      writeFileSync(f, searchPage("q.addEventListener('input', apply);"));
      await functionKept(page, f, {});
      assert.equal(await page.inputValue('#q'), '', 'search box cleared afterwards');
    } finally {
      await page.close();
    }
  });
});

test('fix 2: a pattern that throws is an error, the other five survive, and it is never counted consistent', async () => {
  const html = shell('', '<div><button>Previous</button><button>Next</button></div>').replace(
    '<main>',
    "<script>const g = window.getComputedStyle; window.getComputedStyle = (e, p) => { if (e && e.tagName === 'H1') throw new Error('boom'); return g.call(window, e, p); };</script><main>"
  );
  const sig = await sigOfHtml(html);
  assert.equal(typeof sig.pageHeader.error, 'string');
  assert.match(sig.pageHeader.error, /boom/);
  assert.deepEqual(sig.pagination, { kinds: ['prev-next'], position: 'below' });
  assert.equal(sig.tableRow.error, undefined);
  assert.deepEqual(sig.dateFormat, { formats: ['iso'] });

  const ok = { tag: 'h1', fontSize: 24, action: 'none', breadcrumb: false };
  const none = { pagination: null, filterBar: null, statusBadge: null, dateFormat: null, tableRow: null };
  const c = consistency({ 'a.html': { ...none, pageHeader: ok }, 'b.html': { ...none, pageHeader: ok }, 'c.html': { ...none, pageHeader: { error: 'boom' } } });
  assert.equal(c.patterns.pageHeader.consistent, false);
  assert.deepEqual(c.patterns.pageHeader.unreadable, ['c.html']);
  assert.deepEqual(c.score, { consistent: 0, of: 1 });
});

test('fix 3: badge colours in oklch() and color-mix() are read', async () => {
  const badge = (name, bg) => `<tr><td>x</td><td><span style="display:inline-block;padding:2px 8px;border-radius:9px;background:${bg}">${name}</span></td></tr>`;
  const html = shell('', '').replace(
    '<tbody>',
    '<tbody>' + badge('Black', 'oklch(0 0 0)') + badge('Mixed', 'color-mix(in srgb, #dcfce7 100%, #ffffff 0%)') + badge('Lime', 'oklch(0.9 0.1 150)') + badge('Alpha', 'rgb(0 0 0 / 0.5)')
  );
  const sig = await sigOfHtml(html);
  assert.equal(sig.statusBadge.Black, '#000000');
  assert.equal(sig.statusBadge.Mixed, '#dcfce7');
  const [r, g, b] = hexOf(sig.statusBadge.Lime);
  assert.ok(g > r && g > b, 'oklch(0.9 0.1 150) is green: ' + sig.statusBadge.Lime);
  assert.ok(hexOf(sig.statusBadge.Alpha).every((v) => Math.abs(v - 128) <= 2), '50% black over white: ' + sig.statusBadge.Alpha);
});

test('fix 4: a header above <main> is found', async () => {
  const html =
    '<!doctype html><meta charset="utf-8"><title>x</title><body style="margin:0"><header style="display:flex;justify-content:space-between"><h1 style="font-size:30px">Danh sách</h1><button>Thêm</button></header><main><section class="card"><table style="width:100%"><thead><tr><th>Tên</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table></section></main></body>';
  const sig = await sigOfHtml(html);
  assert.deepEqual(sig.pageHeader, { tag: 'h1', fontSize: 30, action: 'header-right', breadcrumb: false });
});

test('fix 5: a sidebar of links is not filter chips, nor is a menu', async () => {
  const links = '<a href="#a" aria-current="page" class="active">Nhân viên</a><a href="#b">Chấm công</a><a href="#c">Nghỉ phép</a><a href="#d">Báo cáo</a>';
  const html = `<!doctype html><meta charset="utf-8"><title>x</title><body style="margin:0;display:flex"><div class="sidebar" style="width:200px">${links}</div><main style="flex:1"><h1>Danh sách</h1><section class="card"><input type="search" aria-label="Tìm" style="width:200px"><table style="width:100%"><thead><tr><th>Tên</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table></section></main></body>`;
  const sig = await sigOfHtml(html);
  assert.deepEqual(sig.filterBar, { search: 'left', control: null });
  const topbar = await sigOfHtml(html.replace('class="sidebar" style="width:200px"', 'class="topnav-menu" style="width:200px"'));
  assert.equal(topbar.filterBar.control, null);
  // while chips right above the table still read as chips
  const real = await sigOfHtml(shell('<div><button class="active">All</button><button>Open</button><button>Done</button></div>', ''));
  assert.equal(real.filterBar.control, 'chips');
});

// A redesign where every page shares one header, filter bar, pager, badge, date and row style.
function perfectPage({ title, action, search, pager, badges, dates, select }) {
  const rows = [0, 1, 2, 3].map(
    (i) =>
      `<tr><td>Nguyễn ${i}</td>${dates ? '<td>2026-11-0' + (i + 1) + '</td>' : ''}${badges ? '<td><span style="display:inline-block;vertical-align:top;padding:0 8px;line-height:20px;border-radius:9px;background:' + ['#dcfce7', '#fef08a', '#fecaca', '#dbeafe'][i] + '">' + ['Đang làm', 'Chờ duyệt', 'Vắng', 'Thử việc'][i] + '</span></td>' : ''}</tr>`
  ).join('');
  return `<!doctype html><meta charset="utf-8"><title>x</title><style>body{margin:0;font:14px system-ui}h1{font-size:24px;margin:0}header{display:flex;justify-content:space-between;padding:16px}td,th{padding:8px;font-size:14px;line-height:20px;text-align:left}tr{height:36px}</style><body><main><header><h1>${title}</h1>${action ? '<button>Thêm</button>' : ''}</header><section class="card"><div style="display:flex;gap:8px">${search ? '<input type="search" aria-label="Tìm" style="width:240px">' : ''}${select ? '<select aria-label="Phòng ban"><option>Tất cả</option><option>Kế toán</option></select>' : ''}</div><table style="width:100%"><thead><tr><th>Tên</th>${dates ? '<th>Ngày</th>' : ''}${badges ? '<th>Trạng thái</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>${pager ? '<div><span>Showing 1–4 of 40</span> <button>1</button><button>2</button></div>' : ''}</section></main></body>`;
}

test('fix 6: a perfectly consistent redesign scores N of N despite content-driven absences', async () => {
  await withTempDir(async (dir) => {
    const list = { search: true, select: true, pager: true, badges: true, dates: true, action: true };
    const files = {
      'employees.html': perfectPage({ title: 'Nhân viên', ...list }),
      'timesheets.html': perfectPage({ title: 'Chấm công', ...list }),
      'leave-requests.html': perfectPage({ title: 'Nghỉ phép', ...list }),
      'reports.html': perfectPage({ title: 'Báo cáo', select: true }),
      'settings.html': perfectPage({ title: 'Cài đặt' }).replace(/<section[\s\S]*<\/section>/, '<section><form><label>Tên<input></label></form></section>'),
    };
    const by = {};
    for (const [f, html] of Object.entries(files)) {
      writeFileSync(join(dir, f), html);
      by[f] = await sigOfFile(join(dir, f));
    }
    const c = consistency(by);
    assert.deepEqual(
      Object.fromEntries(Object.entries(c.patterns).map(([k, v]) => [k, v.consistent])),
      { pagination: true, filterBar: true, pageHeader: true, statusBadge: true, dateFormat: true, tableRow: true },
      JSON.stringify(by)
    );
    assert.deepEqual(c.score, { consistent: 6, of: 6 });
  });
});

test('fix 6: a real inconsistency on a shared sub-feature still counts', () => {
  const h = (action, size = 24) => ({ tag: 'h1', fontSize: size, action, breadcrumb: false });
  const n = { pagination: null, statusBadge: null, dateFormat: null, tableRow: null, filterBar: null };
  let c = consistency({ 'a.html': { ...n, pageHeader: h('header-right') }, 'b.html': { ...n, pageHeader: h('none') }, 'c.html': { ...n, pageHeader: h('header-right') } });
  assert.equal(c.patterns.pageHeader.consistent, true);
  c = consistency({ 'a.html': { ...n, pageHeader: h('header-right') }, 'b.html': { ...n, pageHeader: h('below-title') } });
  assert.equal(c.patterns.pageHeader.consistent, false);
  c = consistency({ 'a.html': { ...n, pageHeader: h('none', 24) }, 'b.html': { ...n, pageHeader: h('none', 28) } });
  assert.equal(c.patterns.pageHeader.consistent, false);
  const f = (search, control) => ({ ...n, filterBar: { search, control } });
  c = consistency({ 'a.html': f('left', 'select'), 'b.html': f('none', 'select'), 'c.html': f('left', null) });
  assert.equal(c.patterns.filterBar.consistent, true);
  c = consistency({ 'a.html': f('left', 'select'), 'b.html': f('right', 'select') });
  assert.equal(c.patterns.filterBar.consistent, false);
  c = consistency({ 'a.html': f('left', 'select'), 'b.html': f('left', 'chips') });
  assert.equal(c.patterns.filterBar.consistent, false);
  // status badge: not counted when no two pages share a status
  c = consistency({ 'a.html': { ...n, statusBadge: { A: '#ffffff' } }, 'b.html': { ...n, statusBadge: { B: '#000000' } } });
  assert.equal(c.patterns.statusBadge.counted, false);
  assert.deepEqual(c.score, { consistent: 0, of: 0 });
});

test('fix 7: row height is the median of single-line rows', async () => {
  const wrapped = '<td style="width:60px">Một đoạn văn bản dài sẽ xuống nhiều dòng trong ô hẹp này nhé</td>';
  const tall = `<tr><td>a</td>${wrapped}</tr>`;
  const flat = '<tr><td>a</td><td style="width:60px">b</td></tr>';
  const html = `<!doctype html><meta charset="utf-8"><title>x</title><style>td{padding:8px;font-size:14px;line-height:20px}</style><body style="margin:0"><main><h1>x</h1><section class="card"><table style="width:300px"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${tall}${tall}${tall}${tall}${flat}${flat}${flat}</tbody></table></section></main></body>`;
  const sig = await sigOfHtml(html);
  assert.equal(sig.tableRow.rawHeight, 36, 'three single-line rows of 36px (8+20+8), not the wrapped ones');
  assert.equal(sig.tableRow.height, 36);
  // all rows wrapped: falls back to all rows
  const all = await sigOfHtml(html.replace(new RegExp(flat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), tall));
  assert.ok(all.tableRow.rawHeight > 50, 'fallback to all rows: ' + all.tableRow.rawHeight);
});

test('fix 8: a script error during load is evidence, not a failure', async () => {
  await withTempDir(async (dir) => {
    const f = join(dir, 'employees.html');
    writeFileSync(f, searchPage("q.addEventListener('input', apply);").replace('</script>', "</script><script>throw new Error('late failure');</script>"));
    const page = await browser.newPage();
    try {
      const r = await functionKept(page, f, { hadSearch: true, hadPagination: false });
      assert.equal(r.ok, true, r.problems.join('|'));
      assert.deepEqual(r.problems, []);
      assert.equal(r.evidence.length, 1);
      assert.match(r.evidence[0], /script error: .*late failure/);
    } finally {
      await page.close();
    }
  });
});

test('fix 9: div/role=row lists and ul/li lists read rows and pagination', async () => {
  await withTempDir(async (dir) => {
    const pager = '<div><button>Previous</button><button>Next</button></div>';
    const grid =
      '<div role="table"><div role="row"><span role="columnheader">Tên</span></div>' +
      ['An', 'Bình', 'Cường'].map((n) => `<div role="row" style="padding:8px"><span role="cell">${n}</span></div>`).join('') +
      '</div>';
    const list = '<ul>' + ['An', 'Bình', 'Cường'].map((n) => `<li style="padding:8px">${n} - nhân viên</li>`).join('') + '</ul>';
    const make = (body) => `<!doctype html><meta charset="utf-8"><title>x</title><body><nav><ul><li>Nhà</li><li>Về</li></ul></nav><main><h1>Nhân viên</h1><section class="card">${body}${pager}</section></main></body>`;
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      for (const [name, body] of [['role-row', grid], ['li', list]]) {
        const f = join(dir, 'employees.html');
        writeFileSync(f, make(body));
        const r = await functionKept(page, f, { hadSearch: false, hadPagination: true });
        assert.deepEqual(r, { ok: true, problems: [], evidence: [] }, name);
        const sig = await signatures(page);
        assert.deepEqual(sig.pagination, { kinds: ['prev-next'], position: 'below' }, name);
        assert.ok(sig.tableRow && sig.tableRow.rawHeight > 0, name + ' row style');
      }
      // and rows really missing are still reported
      const f = join(dir, 'employees.html');
      writeFileSync(f, make('<ul></ul>'));
      const r = await functionKept(page, f, { hadSearch: false, hadPagination: false });
      assert.ok(r.problems.includes('no data rows'), r.problems.join('|'));
    } finally {
      await page.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Grader fix round 2.
// ---------------------------------------------------------------------------------------------------------------
test('fix A: a layout wrapper with a sidebar class around <main> does not hide the controls or the rows', async () => {
  const side = '<aside><a href="#a">Một</a><a href="#b">Hai</a><a href="#c">Ba</a></aside>';
  const chips = '<input type="search" aria-label="Tìm" style="width:200px"><div><button class="active">All</button><button>Open</button><button>Done</button></div><select aria-label="Phòng"><option>A</option><option>B</option></select>';
  const table = `<table style="width:100%"><thead><tr><th>Tên</th></tr></thead><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>`;
  const wrap = (inner) => `<!doctype html><meta charset="utf-8"><title>x</title><body class="has-sidebar" style="margin:0"><div class="app sidebar-layout filter-menu" style="display:flex">${side}<main style="flex:1"><h1>Danh sách</h1><section class="card">${inner}</section></main></div></body>`;
  const sig = await sigOfHtml(wrap(chips + table));
  assert.deepEqual(sig.filterBar, { search: 'left', control: 'chips' });
  assert.ok(sig.tableRow && sig.tableRow.rawHeight > 0);
  // rows as role=row, found through the same wrapper
  const rows = '<div role="table"><div role="row"><span role="columnheader">Tên</span></div><div role="row" style="padding:8px"><span role="cell">An</span></div><div role="row" style="padding:8px"><span role="cell">Bình</span></div></div><div><button>Previous</button><button>Next</button></div>';
  const sig2 = await sigOfHtml(wrap(rows));
  assert.ok(sig2.tableRow && sig2.tableRow.rawHeight > 0, 'role=row rows read inside the wrapper');
  assert.deepEqual(sig2.pagination, { kinds: ['prev-next'], position: 'below' });
});

const cardPage = (cardClass, tag, extra = '') =>
  `<!doctype html><meta charset="utf-8"><title>x</title><body><main><h1>Nhân viên</h1>${extra}<section><input type="search" id="q" aria-label="Tìm nhân viên"><div class="grid">${['Nguyễn Văn An', 'Trần Bình', 'Lê Cường', 'Phạm Dung']
    .map((n) => `<${tag} class="${cardClass}" style="padding:8px;margin:4px">${n} - Kế toán</${tag}>`)
    .join('')}</div></section></main><script>
const q = document.getElementById('q');
q.addEventListener('input', () => { for (const c of document.querySelectorAll('.${cardClass}')) c.style.display = !q.value || c.textContent.includes(q.value) ? '' : 'none'; });
</script></body>`;

test('fix B: a card grid (article or repeated div) passes function-kept and its search narrows', async () => {
  await withTempDir(async (dir) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      for (const [cls, tag] of [['person', 'article'], ['person', 'div']]) {
        const f = join(dir, 'employees.html');
        writeFileSync(f, cardPage(cls, tag));
        const r = await functionKept(page, f, { hadSearch: true, hadPagination: false });
        assert.deepEqual(r, { ok: true, problems: [], evidence: [] }, tag);
      }
    } finally {
      await page.close();
    }
  });
});

test('fix C: row fallbacks are for list pages and prefer the group with the known name', async () => {
  await withTempDir(async (dir) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const notices = '<ul>' + [1, 2, 3, 4, 5, 6].map((i) => `<li>Thông báo số ${i}</li>`).join('') + '</ul>';
      const f = join(dir, 'employees.html');
      writeFileSync(f, cardPage('person', 'div', notices));
      const r = await functionKept(page, f, { hadSearch: true, hadPagination: false });
      assert.deepEqual(r, { ok: true, problems: [], evidence: [] }, 'the 4 cards are the results, not the 6 notices (search narrows them)');
      const sig = await signatures(page);
      assert.ok(sig.tableRow && sig.tableRow.rawHeight > 0);
      // a settings page with a list gets no table-row style
      const s = join(dir, 'settings.html');
      writeFileSync(s, '<!doctype html><meta charset="utf-8"><title>x</title><body><main><h1>Cài đặt</h1><ul><li>Một mục</li><li>Hai mục</li><li>Ba mục 2026-11-02</li></ul><label>Tên<input></label></main></body>');
      await page.goto(pathToFileURL(s).href);
      const sSig = await signatures(page);
      assert.equal(sSig.tableRow, null);
      assert.equal(sSig.dateFormat, null);
      assert.equal(sSig.statusBadge, null);
      const rs = await functionKept(page, s, { hadSearch: false, hadPagination: false });
      assert.ok(rs.problems.some((p) => /fewer than 3 labelled fields/.test(p)), rs.problems.join('|'));
    } finally {
      await page.close();
    }
  });
});

test('fix D: a pattern that cannot be read is not "kept"', async () => {
  await withTempDir(async (dir) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const f = join(dir, 'employees.html');
      const html = shell('', '<div><button>Previous</button><button>Next</button></div>').replace(
        '<main>',
        "<script>const g = window.getComputedStyle; window.getComputedStyle = (e, p) => { if (e && e.tagName === 'BUTTON') throw new Error('boom'); return g.call(window, e, p); };</script><main>"
      );
      writeFileSync(f, html);
      const r = await functionKept(page, f, { hadSearch: false, hadPagination: true });
      assert.equal(r.ok, false);
      assert.ok(r.problems.some((p) => /^could not read pagination: .*boom/.test(p)), r.problems.join('|'));
    } finally {
      await page.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Task 3: grade(before, after) — change metrics, report JSON
// ---------------------------------------------------------------------------------------------------------------
const GRADE_TIMEOUT = 600000;
const tmpDirs = [];
const tmp = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
};
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// FIXTURE.md "Counted tells" column, one literal list per page.
const PLANNED_TELLS = {
  'employees.html': ['no-gradient', 'no-backdrop-blur', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold', 'greeting-header', 'rainbow-status'],
  'timesheets.html': ['no-gradient', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold', 'rainbow-status'],
  'leave-requests.html': ['no-gradient', 'no-backdrop-blur', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'table-above-fold', 'greeting-header', 'initials-avatar-non-person'],
  'reports.html': ['no-gradient', 'surface-shadow', 'uppercase-text', 'emoji-icon', 'initials-avatar-non-person'],
  'settings.html': ['no-gradient', 'surface-shadow', 'uppercase-text', 'emoji-icon'],
};
const sortedTells = (list) => [...list].sort();
const withoutTime = (report) => JSON.stringify({ ...report, generatedAt: null });

let selfRun;
const gradeSelf = () =>
  (selfRun ||= (async () => {
    const outDir = tmp('eval-self-');
    return { outDir, report: await grade(FIXTURE, FIXTURE, { outDir }) };
  })());

test('grade: the fixture against itself is 0 of 6, 0% diff, the planned tells, function kept', { timeout: GRADE_TIMEOUT }, async () => {
  const { outDir, report } = await gradeSelf();
  assert.deepEqual(report.consistency.before.score, { consistent: 0, of: 6 });
  assert.deepEqual(report.consistency.after.score, { consistent: 0, of: 6 });
  assert.deepEqual(Object.keys(report.pages).sort(), Object.keys(GRADER_PAGES).sort());
  for (const [file, type] of Object.entries(GRADER_PAGES)) {
    const p = report.pages[file];
    assert.equal(p.type, type, file);
    assert.equal(p.pixelDiffPct, 0, `${file}: pixel diff`);
    assert.deepEqual(p.audit.before, p.audit.after, `${file}: audit`);
    assert.equal(typeof p.audit.before.score, 'number', `${file}: audit score`);
    assert.deepEqual(p.tells.before, p.tells.after, `${file}: tells`);
    assert.deepEqual(sortedTells(p.tells.before), sortedTells(PLANNED_TELLS[file]), `${file}: counted tells vs FIXTURE.md`);
    assert.equal(p.functionKept.ok, true, `${file}: function kept ${JSON.stringify(p.functionKept.problems)}`);
    const name = file.replace(/\.html$/, '');
    for (const side of ['before', 'after']) {
      for (const f of [`${name}.png`, `${name}.full.png`]) assert.ok(existsSync(join(outDir, 'screens', side, f)), `${side}/${f}`);
    }
  }
  assert.equal(report.summary.functionKept.ok, 5);
  assert.equal(report.summary.functionKept.of, 5);
  assert.deepEqual(report.summary.pagesMissing, []);
  assert.equal(report.summary.pixelDiffPct.max, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')), JSON.parse(JSON.stringify(report)));
});

test('grade: grading twice gives identical JSON apart from generatedAt', { timeout: GRADE_TIMEOUT }, async () => {
  const first = (await gradeSelf()).report;
  const second = await grade(FIXTURE, FIXTURE, { outDir: tmp('eval-self2-') });
  assert.equal(typeof first.generatedAt, 'string');
  assert.equal(withoutTime(second), withoutTime(first));
});

const stripGradients = (html) => html.replace(/linear-gradient\((?:[^()]|\([^()]*\))*\)/g, '#4f46e5');
const SHARED_PAGER = (total) =>
  `<div class="pg2" style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:14px"><span>Hiển thị 1–10 trên ${total} mục</span><span><button type="button">Trước</button> <button type="button">Sau</button></span></div>`;

test('grade: a hand-fixed copy is seen as better, and a page that throws fails function-kept with the error', { timeout: GRADE_TIMEOUT }, async () => {
  const copy = tmp('eval-fixed-');
  cpSync(FIXTURE, copy, { recursive: true });
  const edit = (file, fn) => writeFileSync(join(copy, file), fn(readFileSync(join(copy, file), 'utf8')));
  const hide = '<style>.pager,.more{display:none !important}</style>';
  // shared pagination on the 3 pages that have one; no gradient at all on 2 of them
  edit('employees.html', (h) => stripGradients(h).replace('<div class="pager">', SHARED_PAGER(48) + hide + '<div class="pager">'));
  edit('timesheets.html', (h) => stripGradients(h).replace('<div class="pager">', SHARED_PAGER(120) + hide + '<div class="pager">'));
  // the pager is below the first screen on this page, so a header button colour change makes the page visibly change too
  edit('leave-requests.html', (h) => h.replace('<div class="more">', SHARED_PAGER(36) + hide + '<style>.page-action{background:#4f46e5}</style><div class="more">'));
  // reports throws before it renders its rows
  edit('reports.html', (h) => h.replace('<script>', '<script>throw new Error("boom: eval fixture");'));
  const report = await grade(FIXTURE, copy, { outDir: tmp('eval-fixed-out-') });
  const pag = (side) => report.consistency[side].patterns.pagination;
  assert.equal(pag('before').consistent, false);
  assert.equal(pag('after').consistent, true, JSON.stringify(pag('after').byPage));
  assert.ok(report.consistency.after.score.consistent > report.consistency.before.score.consistent);
  for (const file of ['employees.html', 'timesheets.html']) {
    const p = report.pages[file];
    assert.ok(p.tells.before.includes('no-gradient'), `${file}: before`);
    assert.ok(!p.tells.after.includes('no-gradient'), `${file}: after still has no-gradient`);
  }
  for (const file of ['employees.html', 'timesheets.html', 'leave-requests.html']) assert.ok(report.pages[file].pixelDiffPct > 0, `${file}: pixel diff`);
  assert.equal(report.pages['settings.html'].pixelDiffPct, 0, 'settings: untouched');
  const fk = report.pages['reports.html'].functionKept;
  assert.equal(fk.ok, false);
  assert.ok(fk.problems.some((p) => p.includes('no data rows')), JSON.stringify(fk.problems));
  assert.ok(fk.problems.some((p) => p.includes('boom: eval fixture')), JSON.stringify(fk.problems));
  for (const f of ['employees.html', 'timesheets.html', 'settings.html']) assert.equal(report.pages[f].functionKept.ok, true, f);
  assert.deepEqual(report.summary.excluded, [], 'every page loaded and audited on both sides');
});

// A tiny stand-in for audit-cli: no browser. Behaviour by the page's file name, and by whether it is on the after side.
const FAKE_AUDIT = `
const a = process.argv.slice(2);
const file = a[a.length - 1];
const base = file.split(/[\\\\/]/).pop();
const after = /eval-audit-/.test(file);
if (after && base === 'reports.html') { console.log('this is not json'); process.exit(0); }
if (after && base === 'timesheets.html') { setInterval(() => {}, 1000); }
else {
  const score = { 'employees.html': 80, 'leave-requests.html': 60 }[base] || 90;
  console.log(JSON.stringify([{ target: file, error: null, result: { score, violations: [{ rule: 'no-gradient', severity: 'error', count: 1 }, { rule: 'surface-shadow', severity: 'warn', count: 2 }] } }]));
}
`;
const fakeAuditCli = () => {
  const dir = tmp('eval-fake-cli-');
  const file = join(dir, 'audit-cli.mjs');
  writeFileSync(file, FAKE_AUDIT);
  return file;
};

test('grade: pages that are missing, fail to audit (not JSON, timeout) or fail to load are left out of the totals', { timeout: GRADE_TIMEOUT }, async () => {
  const copy = tmp('eval-audit-');
  cpSync(FIXTURE, copy, { recursive: true });
  rmSync(join(copy, 'settings.html'));
  writeFileSync(join(copy, 'extra.html'), '<!doctype html><title>x</title>');
  const report = await grade(FIXTURE, copy, { outDir: tmp('eval-audit-out-'), auditCli: fakeAuditCli(), auditTimeoutMs: 4000 });
  const p = report.pages;
  assert.deepEqual(p['settings.html'].functionKept.problems, ['page missing']);
  assert.equal(p['settings.html'].audit.after, null);
  assert.equal(p['settings.html'].pixelDiffPct, null);
  assert.deepEqual(report.summary.pagesMissing, ['settings.html']);
  assert.equal(p['extra.html'], undefined);
  assert.ok(p['reports.html'].functionKept.problems.includes('audit error: audit output is not JSON'), JSON.stringify(p['reports.html'].functionKept.problems));
  assert.ok(p['timesheets.html'].functionKept.problems.some((x) => /^audit error: audit timed out/.test(x)), JSON.stringify(p['timesheets.html'].functionKept.problems));
  assert.equal(p['timesheets.html'].audit.after.score, null);
  // the excluded pages have no after tells; the before tells stay
  for (const f of ['settings.html', 'reports.html', 'timesheets.html']) assert.equal(p[f].tells.after, null, f);
  assert.ok(Array.isArray(p['reports.html'].tells.before));
  assert.deepEqual(report.summary.excluded.map((x) => x.page), ['timesheets.html', 'reports.html', 'settings.html']);
  assert.match(report.summary.excluded[0].reason, /after audit error: audit timed out/);
  assert.match(report.summary.excluded[1].reason, /after audit error: audit output is not JSON/);
  assert.equal(report.summary.excluded[2].reason, 'page missing after');
  // totals cover employees and leave-requests only: each has 2 audit tells and 2 detector tells
  assert.deepEqual(report.summary.tellsTotal, { before: 8, after: 8 });
  assert.deepEqual(report.summary.auditScoreMean, { before: 70, after: 70 });
  assert.equal(p['employees.html'].functionKept.ok, true);
});

test('grade: a hanging stylesheet is bounded, and a page stuck in a loop is an error while the rest is graded', { timeout: GRADE_TIMEOUT }, async () => {
  const copy = tmp('eval-guard-');
  cpSync(FIXTURE, copy, { recursive: true });
  const edit = (file, fn) => writeFileSync(join(copy, file), fn(readFileSync(join(copy, file), 'utf8')));
  edit('leave-requests.html', (h) => h.replace('<head>', '<head><link rel="stylesheet" href="http://10.255.255.1/x.css">'));
  edit('timesheets.html', (h) => h.replace('<script>', '<script>setTimeout(function () { while (true) {} }, 50);'));
  const started = Date.now();
  const report = await grade(FIXTURE, copy, { outDir: tmp('eval-guard-out-'), auditCli: fakeAuditCli(), pageGuardMs: 8000, netTimeoutMs: 2000 });
  const p = report.pages;
  assert.ok(Date.now() - started < 180000, 'bounded');
  assert.equal(p['leave-requests.html'].functionKept.ok, true, JSON.stringify(p['leave-requests.html'].functionKept.problems));
  assert.equal(typeof p['leave-requests.html'].pixelDiffPct, 'number');
  assert.ok(Array.isArray(p['leave-requests.html'].tells.after));
  assert.equal(p['timesheets.html'].functionKept.ok, false);
  assert.ok(p['timesheets.html'].functionKept.problems.some((x) => /timed out|timeout/i.test(x)), JSON.stringify(p['timesheets.html'].functionKept.problems));
  assert.equal(p['timesheets.html'].pixelDiffPct, null);
  assert.equal(p['timesheets.html'].tells.after, null);
  assert.deepEqual(report.summary.excluded.map((x) => x.page), ['timesheets.html']);
  assert.match(report.summary.excluded[0].reason, /^after side failed to load:/);
  for (const f of ['employees.html', 'reports.html', 'settings.html']) {
    assert.equal(p[f].functionKept.ok, true, f);
    assert.equal(p[f].pixelDiffPct, 0, f);
  }
});

test('grade CLI: no arguments exits 2 and prints the usage', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'agent-eval', 'consistency', 'grade.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage: node tests\/agent-eval\/consistency\/grade\.mjs <before-dir> <after-dir>/);
});

// ---- detectors, on synthetic markup --------------------------------------------------------------------------------------
async function detectorsFor(html) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif"><main>${html}</main></body>`);
    return await detectorsOf(page);
  } finally {
    await page.close();
  }
}
const AV = (letters, extra = '') =>
  `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#e0e7ff;margin-right:8px;${extra}">${letters}</span>`;
const tableOf = (...cells) => `<table><tbody>${cells.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

test('detectors: initials-avatar-non-person is not fooled by checkbox columns, titles, particles, or an email elsewhere', { timeout: 60000 }, async () => {
  const flagged = async (html) => (await detectorsFor(html)).avatarNonPerson;
  assert.equal(await flagged(tableOf(['<input type="checkbox">', AV('LM') + 'Lê Minh Hoa', 'x'])), false, 'checkbox column, avatar and name');
  assert.equal(await flagged(tableOf([AV('NA') + '<div>Nguyễn Văn An<br><small>Kế toán trưởng</small></div>', 'x'])), false, 'name then job title');
  assert.equal(await flagged(tableOf([AV('TH') + 'Trần thị Hoa', 'x'])), false, 'lowercase particle');
  assert.equal(await flagged(tableOf([AV('KT') + 'Phòng Kế toán', 'x'])), true, 'a department');
  assert.equal(await flagged(tableOf([AV('KT') + 'Phòng Kế toán', 'lead@example.com'])), false, 'an email in the row');
  assert.equal(await flagged(tableOf([AV('LV') + 'LV-001', 'Nguyễn Văn An'])), true, 'a code, the name is in another column');
});

test('detectors: rainbow-status counts badge-like hues, merges red and rose, and ignores avatars', { timeout: 60000 }, async () => {
  const badge = (bg, text) => `<span class="badge" style="display:inline-block;padding:2px 10px;border-radius:999px;background:${bg}">${text}</span> `;
  const hues = async (html) => (await detectorsFor(html)).hueBuckets;
  const pastels = ['#fef2f2', '#fff7ed', '#f0fdf4', '#eff6ff', '#faf5ff'].map((c, i) => badge(c, 'Status ' + 'ABCDE'[i])).join('');
  assert.equal(await hues(pastels), 5, 'five Tailwind-50 pastels');
  const red = ['#ef4444', '#f43f5e', '#f97316', '#22c55e', '#3b82f6'].map((c, i) => badge(c, 'State ' + 'ABCDE'[i])).join('');
  assert.equal(await hues(red), 4, 'red and rose are one hue');
  const squares = ['#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#eab308'].map((c, i) => AV('AB'[i % 2] + 'CDEFG'[i], `background:${c};border-radius:6px`));
  assert.equal(await hues(tableOf(...squares.map((s) => [s + 'Someone ' + 'X']))), 0, 'per-person coloured square avatars');
  const plain = (bg, text) => `<span style="display:inline-block;padding:2px 10px;background:${bg}">${text}</span>`;
  const colours = ['#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff'];
  const labels = ['Open', 'Hold', 'Done', 'Review', 'Late'];
  const repeated = tableOf(...[0, 1].map(() => colours.map((c, i) => plain(c, labels[i]))));
  assert.equal(await hues(repeated), 5, 'the same labels in 2 rows without a badge class');
  assert.equal(await hues(tableOf(colours.map((c, i) => plain(c, labels[i])))), 0, 'once, without a class: not a badge');
  const dot = (c, t) => `<span class="status"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c}"></i> ${t}</span> `;
  assert.equal(await hues(['#ef4444', '#f97316', '#22c55e', '#3b82f6', '#a855f7'].map((c, i) => dot(c, 'Item ' + 'ABCDE'[i])).join('')), 5, 'dot and text badges');
});

const GRADE_FILE = join(ROOT, 'tests', 'agent-eval', 'consistency', 'grade.mjs');

// A rewrite that shows a skeleton first and renders its rows later is read after the rows are there.
// reports: the skeleton is marked aria-busy / animate-pulse, rows after 400 ms.
// leave-requests: the skeleton is only a row with class="skeleton-row", rows after 900 ms (after the 300 ms quiet period).
const lateReport = (skeletonRow, delay) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo</title>
<style>body{margin:0;font:14px sans-serif}main{padding:24px}td,th{padding:20px;text-align:left}.skel-block{position:absolute;left:300px;top:200px;width:200px;height:100px;background:#f00}</style></head>
<body><main><h1>Báo cáo</h1><table><thead><tr><th>Phòng ban</th><th>Nhân sự</th></tr></thead><tbody id="b"></tbody></table></main>
<script>
const b = document.getElementById('b');
b.innerHTML = '${skeletonRow}';
setTimeout(() => { b.innerHTML = ['Kế toán', 'Nhân sự', 'Kinh doanh'].map((d, i) => '<tr><td>' + d + '</td><td>' + (4 + i) + '</td></tr>').join(''); }, ${delay});
</script></body></html>`;

async function pixelAt(png, x, y) {
  const page = await browser.newPage();
  try {
    await page.setContent('<canvas id="c"></canvas>');
    return await page.evaluate(
      async ([b64, px, py]) => {
        const im = new Image();
        im.src = 'data:image/png;base64,' + b64;
        await im.decode();
        const c = document.getElementById('c');
        c.width = im.width;
        c.height = im.height;
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0);
        return Array.from(g.getImageData(px, py, 1, 1).data);
      },
      [readFileSync(png).toString('base64'), x, y]
    );
  } finally {
    await page.close();
  }
}

test('grade: skeleton pages are read after their rows arrive; a detector that throws keeps the page', { timeout: GRADE_TIMEOUT }, async () => {
  const copy = tmp('eval-skel-');
  cpSync(FIXTURE, copy, { recursive: true });
  writeFileSync(join(copy, 'reports.html'), lateReport('<tr class="skel"><td aria-busy="true"><div class="skel-block animate-pulse"></div></td><td></td></tr>', 400));
  writeFileSync(join(copy, 'leave-requests.html'), lateReport('<tr class="skeleton-row"><td><div class="skel-block"></div></td><td></td></tr>', 900));
  // every layout call throws: the detectors cannot read this page, but it still loads and is photographed
  const settings = join(copy, 'settings.html');
  writeFileSync(settings, readFileSync(settings, 'utf8').replace('<script>', '<script>Element.prototype.getBoundingClientRect = function () { throw new Error("odd markup"); };'));
  const outDir = tmp('eval-skel-out-');
  const report = await grade(FIXTURE, copy, { outDir, auditCli: fakeAuditCli() });
  for (const f of ['reports.html', 'leave-requests.html']) {
    const row = report.consistency.after.patterns.tableRow.byPage[f];
    assert.ok(row && row.rawHeight >= 55 && row.rawHeight <= 70, `${f}: real rows, not the skeleton: ${JSON.stringify(row)}`);
    const px = await pixelAt(join(outDir, 'screens', 'after', f.replace('.html', '.png')), 400, 250);
    assert.notDeepEqual(px.slice(0, 3), [255, 0, 0], `${f}: the skeleton block is not in the screenshot`);
  }
  assert.equal(report.pages['reports.html'].functionKept.ok, true, JSON.stringify(report.pages['reports.html'].functionKept.problems));
  const s = report.pages['settings.html'];
  assert.ok(Array.isArray(s.tells.after), 'settings is not excluded');
  assert.ok(!report.summary.excluded.some((x) => x.page === 'settings.html'), JSON.stringify(report.summary.excluded));
  assert.ok(s.functionKept.evidence.some((e) => /detector tells could not be read \(after\)/.test(e)), JSON.stringify(s.functionKept.evidence));
  assert.ok(existsSync(join(outDir, 'screens', 'after', 'settings.png')));
});

test('grade CLI: a run on one page exits 0 promptly, writes report.json under --out and prints the table', { timeout: 180000 }, async () => {
  const [before, after, out] = ['eval-cli-b-', 'eval-cli-a-', 'eval-cli-out-'].map(tmp);
  for (const d of [before, after]) cpSync(join(FIXTURE, 'settings.html'), join(d, 'settings.html'));
  const started = Date.now();
  const r = await new Promise((done) =>
    execFile(process.execPath, [GRADE_FILE, before, after, '--out', out], { timeout: 150000, encoding: 'utf8' }, (err, stdout, stderr) => done({ code: err ? err.code : 0, stdout, stderr }))
  );
  assert.equal(r.code, 0, r.stderr);
  assert.ok(Date.now() - started < 60000, `took ${Date.now() - started} ms`);
  assert.ok(existsSync(join(out, 'report.json')));
  assert.match(r.stdout, /settings\.html/);
  assert.match(r.stdout, /Consistency \(before -> after\)/);
});
