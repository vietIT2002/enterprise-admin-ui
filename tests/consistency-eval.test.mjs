// Fixture part of the consistency evaluation: the five-page "AI-made" attendance admin in
// tests/agent-eval/consistency/fixture/. Asserts DOM facts directly (the variants listed in
// tests/agent-eval/consistency/FIXTURE.md), not through the grader.
//
// Uses Playwright's Chromium (`npx playwright install chromium`), or an installed Google Chrome when that is missing.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

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
