// Fixture part of the consistency evaluation: the five-page "AI-made" attendance admin in
// tests/agent-eval/consistency/fixture/. Asserts DOM facts directly (the variants listed in
// tests/agent-eval/consistency/FIXTURE.md), not through the grader.
//
// Uses Playwright's Chromium (`npx playwright install chromium`), or an installed Google Chrome when that is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PAGES as GRADER_PAGES, consistency, functionKept, signatures } from './agent-eval/consistency/grade.mjs';

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
  assert.equal(t.tableRow.height, 32);
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
  assert.deepEqual(Object.values(await signatures(page)), [null, null, null, null, null, null], 'a closed page does not throw');
});

// ---- function kept -----------------------------------------------------------------------------------------------
test('functionKept: passes every fixture page', async () => {
  const had = { 'employees.html': [true, true], 'timesheets.html': [true, true], 'leave-requests.html': [true, true], 'reports.html': [false, false], 'settings.html': [false, false] };
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    for (const f of FILES) {
      const r = await functionKept(page, join(FIXTURE, f), { hadSearch: had[f][0], hadPagination: had[f][1] });
      assert.deepEqual(r, { ok: true, problems: [] }, f);
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
    assert.deepEqual(r, { ok: false, problems: ['page missing'] });

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
