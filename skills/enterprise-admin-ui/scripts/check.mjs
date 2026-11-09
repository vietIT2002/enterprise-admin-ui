#!/usr/bin/env node
// Behaviour checks for a management screen: the parts agents most often leave out, tested in a real browser.
// Run it after writing a page, fix every ✗, and run it again until it exits 0.
//
//   node scripts/check.mjs <page.html|url> [--page list|detail|form|dashboard|settings|wizard|other] [--json] [--no-audit]
//
// Exit codes: 0 every check passed or was skipped, 1 a check failed, 2 the check could not run.
// Needs Playwright with Chromium in the project (npm i -D playwright && npx playwright install chromium).
//
// Markup contract (the templates in assets/templates follow it):
// - Each list, table or panel that shows data: data-region="<name>", with children data-state="empty|loading|error"
//   that the page shows for ?state=empty|loading|error. Empty has a next action, loading is aria-busy, error has Retry.
// - A filtered list shows its count in an element with data-result-count ("48 orders").
// - Export controls name the count ("Export 48 orders"). A page with Print has a print stylesheet.
// - Destructive actions open a confirmation. Status and error messages go to a role="status"/"alert" region.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.join(here, 'audit.js');
const PAGE_TYPES = ['list', 'detail', 'form', 'dashboard', 'settings', 'wizard'];

const SEARCH = 'input[type="search"], [role="searchbox"], input[aria-label*="search" i], input[placeholder*="search" i], input[aria-label*="tìm" i], input[placeholder*="tìm" i]';
const EXPORT_RE = /\b(export|download)\b|xuất|tải xuống/i;
const PRINT_RE = /\bprint\b|^in\b|^in /i;
const DESTRUCTIVE_RE = /\b(delete|remove|deactivate|terminate)\b|xóa|xoá|vô hiệu|ngừng hoạt động/i;
// Removing a filter, a form line or a row before saving is undoable in place and needs no confirmation.
const NOT_DESTRUCTIVE_RE = /\bremove (filter|line|row)|xóa (bộ lọc|dòng)|xoá (bộ lọc|dòng)/i;
const RETRY_RE = /retry|try again|reload|thử lại|tải lại/i;

const withState = (url, s) => {
  const u = new URL(url);
  u.searchParams.set('state', s);
  return u.href;
};

async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  return page;
}

// Runs inside the page: is the element rendered and not hidden?
const VISIBLE = `(e) => !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')`;

const pass = (id, message) => ({ id, status: 'pass', message });
const skip = (id, message) => ({ id, status: 'skip', message });
const fail = (id, message, fix) => ({ id, status: 'fail', message, fix });

async function checkStates(browser, url, pageType) {
  const p = await open(browser, url);
  const regions = await p.$$eval('[data-region]', (els) => els.map((e) => e.getAttribute('data-region')));
  await p.close();
  if (!regions.length) {
    if (pageType === 'form' || pageType === 'settings' || pageType === 'wizard') return skip('states', 'no data-region on this page');
    return fail('states', 'No element is marked data-region, so the empty, loading and error states cannot be checked',
      'Wrap each list, table or panel that shows data in an element with data-region="<name>" and give it children data-state="empty", "loading" and "error" that ?state=empty|loading|error shows.');
  }
  const problems = [];
  for (const s of ['empty', 'loading', 'error']) {
    const q = await open(browser, withState(url, s));
    const found = await q.evaluate(({ s, vis, retry }) => {
      const visible = new Function('return ' + vis)();
      const re = new RegExp(retry, 'i');
      return [...document.querySelectorAll('[data-region]')].filter(visible).map((r) => {
        const name = r.getAttribute('data-region');
        const el = [...r.querySelectorAll(`[data-state="${s}"]`)].find(visible);
        if (!el) return `${name}: no visible data-state="${s}" for ?state=${s}`;
        if (s === 'empty' && !el.querySelector('button, a[href]')) return `${name}: the empty state has no next action (a button or link)`;
        if (s === 'loading' && !(el.closest('[aria-busy="true"]') || el.querySelector('[aria-busy="true"]'))) return `${name}: the loading state is not marked aria-busy="true"`;
        if (s === 'error' && ![...el.querySelectorAll('button, a')].some((b) => re.test(b.textContent))) return `${name}: the error state has no Retry`;
        return null;
      }).filter(Boolean);
    }, { s, vis: VISIBLE, retry: RETRY_RE.source });
    await q.close();
    problems.push(...found);
  }
  return problems.length
    ? fail('states', problems.join('; '), 'Each data region shows, for ?state=empty|loading|error: an empty message with its next action, a skeleton marked aria-busy="true", and an inline error with a Retry button.')
    : pass('states', `${regions.length} region(s) show empty, loading and error`);
}

async function checkResultCount(browser, url, pageType) {
  const p = await open(browser, url);
  try {
    const hasSearch = await p.locator(SEARCH).first().isVisible().catch(() => false);
    if (!hasSearch && pageType !== 'list') return skip('result-count', 'no search or filter on this page');
    const readCount = () => p.evaluate((vis) => {
      const visible = new Function('return ' + vis)();
      const el = [...document.querySelectorAll('[data-result-count]')].find(visible);
      if (!el) return null;
      const m = (el.textContent || '').replace(/[.,\s](?=\d{3}\b)/g, '').match(/\d+/);
      return m ? Number(m[0]) : NaN;
    }, VISIBLE);
    const before = await readCount();
    if (before === null) return fail('result-count', 'No visible element with data-result-count', 'Show the number of matching records next to the filters, e.g. <span data-result-count>48 orders</span>, and update it on every search or filter change.');
    if (Number.isNaN(before)) return fail('result-count', 'The data-result-count element has no number in it', 'Put the count in the element: "48 orders".');
    if (!hasSearch) return pass('result-count', `count shown (${before})`);
    await p.locator(SEARCH).first().fill('zzqx-no-match-7');
    await p.waitForTimeout(700);
    const after = await readCount();
    const empty = await p.evaluate((vis) => {
      const visible = new Function('return ' + vis)();
      return [...document.querySelectorAll('[data-state="empty"]')].some(visible) || /no .*(match|result)|không (có|tìm thấy)/i.test(document.body.innerText);
    }, VISIBLE);
    if (after === before && before !== 0) return fail('result-count', `The count stayed at ${before} after a search that matches nothing`, 'Update data-result-count on every search or filter change.');
    if (!empty) return fail('result-count', 'A search that matches nothing shows no "no results" state', 'Show a no-results state ("No orders match these filters") with a Clear filters action.');
    return pass('result-count', `count ${before} → ${after} on a search with no match`);
  } finally {
    await p.close();
  }
}

async function checkExportCount(browser, url) {
  const p = await open(browser, url);
  try {
    const names = await p.evaluate(({ vis, re }) => {
      const visible = new Function('return ' + vis)();
      const rx = new RegExp(re, 'i');
      return [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')]
        .filter((b) => visible(b) && !b.closest('[role="dialog"], [role="alertdialog"], dialog'))
        .map((b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => rx.test(t));
    }, { vis: VISIBLE, re: EXPORT_RE.source });
    if (!names.length) return skip('export-count', 'no visible Export control');
    const bad = names.filter((n) => !/\d/.test(n));
    return bad.length
      ? fail('export-count', `Export does not name its count: "${bad[0]}"`, 'Name the scope and count on the control: "Export 48 orders", or "Export 3 selected" when rows are selected.')
      : pass('export-count', `"${names[0]}"`);
  } finally {
    await p.close();
  }
}

async function checkPrint(browser, url) {
  const p = await open(browser, url);
  try {
    const has = await p.evaluate(({ vis, re }) => {
      const visible = new Function('return ' + vis)();
      const rx = new RegExp(re, 'i');
      return [...document.querySelectorAll('button, a, [role="button"]')].some((b) => visible(b) && rx.test((b.textContent || b.getAttribute('aria-label') || '').trim()));
    }, { vis: VISIBLE, re: PRINT_RE.source });
    if (!has) return skip('print', 'no Print control');
    await p.emulateMedia({ media: 'print' });
    const r = await p.evaluate((vis) => {
      const visible = new Function('return ' + vis)();
      const h1 = [...document.querySelectorAll('h1')].some(visible);
      const nav = [...document.querySelectorAll('nav, aside, [role="navigation"]')].filter(visible).length;
      const buttons = [...document.querySelectorAll('button')].filter(visible).length;
      return { h1, nav, buttons };
    }, VISIBLE);
    const problems = [];
    if (!r.h1) problems.push('the title (h1) is hidden when printing');
    if (r.nav) problems.push(`${r.nav} navigation element(s) still print`);
    if (r.buttons) problems.push(`${r.buttons} button(s) still print`);
    return problems.length
      ? fail('print', problems.join('; '), 'Add @media print { nav, aside, button, input, select { display: none !important } } and keep the title, period and totals.')
      : pass('print', 'printing keeps the title and hides navigation and buttons');
  } finally {
    await p.close();
  }
}

async function checkConfirm(browser, url) {
  const p = await open(browser, url);
  let native = false;
  p.removeAllListeners('dialog');
  p.on('dialog', (d) => { native = true; d.dismiss().catch(() => {}); });
  try {
    const index = await p.evaluate(({ vis, re, not }) => {
      const visible = new Function('return ' + vis)();
      const rx = new RegExp(re, 'i');
      const nx = new RegExp(not, 'i');
      const all = [...document.querySelectorAll('button, [role="button"], [role="menuitem"]')];
      return all.findIndex((b) => {
        const name = b.getAttribute('aria-label') || b.textContent || '';
        return visible(b) && !b.closest('[role="dialog"], [role="alertdialog"], dialog') && rx.test(name) && !nx.test(name);
      });
    }, { vis: VISIBLE, re: DESTRUCTIVE_RE.source, not: NOT_DESTRUCTIVE_RE.source });
    if (index < 0) return skip('confirm', 'no visible delete, remove or deactivate action');
    const target = p.locator('button, [role="button"], [role="menuitem"]').nth(index);
    const label = ((await target.getAttribute('aria-label')) || (await target.textContent()) || '').replace(/\s+/g, ' ').trim();
    await target.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(400);
    const dialog = await p.evaluate((vis) => {
      const visible = new Function('return ' + vis)();
      return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].some(visible);
    }, VISIBLE);
    if (dialog) return pass('confirm', `"${label}" opens a confirmation`);
    if (native) return pass('confirm', `"${label}" asks with the browser's confirm(); a dialog that names the record is better`);
    return fail('confirm', `"${label}" acts without a confirmation`, 'Open a dialog (role="alertdialog") that names the record and the consequence, with focus on Cancel.');
  } finally {
    await p.close();
  }
}

async function checkLiveRegion(browser, url) {
  const p = await open(browser, url);
  try {
    const n = await p.locator('[role="status"], [role="alert"], [aria-live]').count();
    return n
      ? pass('live-region', `${n} live region(s)`)
      : fail('live-region', 'No role="status", role="alert" or aria-live region for messages', 'Add <div role="status" aria-live="polite"> for toasts and status text, and show errors with role="alert".');
  } finally {
    await p.close();
  }
}

async function checkAudit(browser, url, pageType) {
  const p = await open(browser, url);
  try {
    await p.addScriptTag({ path: AUDIT });
    const r = await p.evaluate((o) => window.enterpriseAdminAudit(o), { pageType: PAGE_TYPES.includes(pageType) ? pageType : null });
    const errors = r.violations.filter((v) => v.severity === 'error');
    const warns = r.violations.filter((v) => v.severity !== 'error');
    if (!errors.length) return pass('audit', `score ${r.score}${warns.length ? ', warnings: ' + warns.map((v) => v.rule).join(', ') : ''}`);
    const first = errors[0].examples && errors[0].examples[0];
    return fail('audit', `score ${r.score}; errors: ${errors.map((v) => `${v.rule} ×${v.count}`).join(', ')}${first ? ` (e.g. ${first.selector}: ${first.actual})` : ''}`,
      errors.map((v) => `${v.rule}: ${v.message}`).join(' · '));
  } finally {
    await p.close();
  }
}

export async function runChecks(browser, url, { pageType = 'list', audit = true } = {}) {
  const results = [];
  if (audit) results.push(await checkAudit(browser, url, pageType));
  results.push(await checkStates(browser, url, pageType));
  results.push(await checkResultCount(browser, url, pageType));
  results.push(await checkExportCount(browser, url));
  results.push(await checkPrint(browser, url));
  results.push(await checkConfirm(browser, url));
  results.push(await checkLiveRegion(browser, url));
  const count = (s) => results.filter((r) => r.status === s).length;
  return { url, pageType, results, passed: count('pass'), failed: count('fail'), skipped: count('skip') };
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {}
  try {
    const req = createRequire(path.join(process.cwd(), 'noop.js'));
    return await import(pathToFileURL(req.resolve('playwright')).href);
  } catch {}
  return null;
}

async function main(argv) {
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const target = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--page');
  if (!target) {
    console.error('Usage: node check.mjs <page.html|url> [--page list|detail|form|dashboard|settings|wizard|other] [--json] [--no-audit]');
    return 2;
  }
  let url;
  if (/^https?:\/\//.test(target)) url = target;
  else {
    const abs = path.resolve(target);
    if (!fs.existsSync(abs)) {
      console.error(`check.mjs: no file at ${abs}. Check the path you wrote the page to.`);
      return 2;
    }
    url = pathToFileURL(abs).href;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    console.error('check.mjs needs Playwright: npm i -D playwright && npx playwright install chromium');
    return 2;
  }
  let browser;
  try {
    browser = await pw.chromium.launch();
  } catch (e) {
    console.error('check.mjs could not start Chromium: npx playwright install chromium\n' + String(e.message || e).split('\n')[0]);
    return 2;
  }
  try {
    const r = await runChecks(browser, url, { pageType: get('--page') || 'list', audit: !argv.includes('--no-audit') });
    if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else {
      for (const x of r.results) {
        console.log(`${x.status === 'pass' ? '✓' : x.status === 'fail' ? '✗' : '–'} ${x.id} — ${x.message}`);
        if (x.fix) console.log(`  fix: ${x.fix}`);
      }
      console.log(`check.mjs: ${r.passed} passed · ${r.failed} failed · ${r.skipped} skipped — ${url.startsWith('file:') ? fileURLToPath(url) : url}`);
    }
    return r.failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error('check.mjs failed: ' + (e && e.message ? e.message : e));
    process.exit(2);
  });
}
