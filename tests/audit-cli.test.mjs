// End-to-end tests for scripts/audit-cli.mjs: the CLI runs as a child process, as an agent would run it.
// The browser is Playwright's Chromium when it is installed (CI), else whatever the CLI finds on the machine.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../tools/build-adapters.mjs';
import { FIXTURES, loadFixtures } from './fixture-pages.mjs';

const CLI = join(ROOT, 'skills/enterprise-admin-ui/scripts/audit-cli.mjs');
const CLEAN = join(FIXTURES, 'list-clean.html');
const ENV = { ...process.env };
try {
  if (existsSync(chromium.executablePath())) ENV.CHROME_PATH = chromium.executablePath();
} catch {
  // Playwright's Chromium is not installed: the CLI looks for a browser itself.
}

const POSIX = process.platform !== 'win32';
const FAKE_BROWSER = join(ROOT, 'tests/helpers/fake-browser.mjs');
const profiles = () => readdirSync(tmpdir()).filter((name) => name.startsWith('eaui-audit-'));

function run(args, { cwd = ROOT, timeout = 90000, cli = CLI, env = {} } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args], { cwd, env: { ...ENV, ...env }, timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr, output: stdout + stderr, ms: Date.now() - started });
    });
  });
}

const BASE_STYLE = `[hidden]{display:none!important} html{font:14px/20px system-ui,sans-serif;color:#0f172a;background:#fff} body{margin:0} main{padding:16px 24px} h1{font-size:20px;line-height:28px;font-weight:600;margin:0 0 16px}`;
const html = (body, style = '') => `<!doctype html><html lang="vi-VN"><head><meta charset="utf-8"><title>t</title><style>${BASE_STYLE}${style}</style></head><body><main>${body}</main></body></html>`;

function statePage(withStates) {
  const rows = ['Công ty Minh Phát', 'Cửa hàng An Bình', 'Nhà thuốc Hoà Hảo']
    .map((name, i) => `<tr><td><a href="#DH-104${i}">DH-104${i}</a></td><td>${name}</td><td>0${i + 2}/11/2026</td></tr>`)
    .join('');
  const table = `<table><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Ngày đặt</th></tr></thead><tbody>${rows}</tbody></table>`;
  const states = withStates
    ? `var state = new URLSearchParams(location.search).get('state');
       if (state === 'loading') slot.innerHTML = '<div aria-busy="true"><div style="height:40px;background:#f1f5f9"></div><div style="height:40px;background:#f1f5f9"></div></div>';
       else if (state === 'empty') slot.innerHTML = '<p>Chưa có đơn hàng nào.</p><button type="button">Tạo đơn hàng</button>';
       else if (state === 'error') slot.innerHTML = '<div role="alert">Không tải được danh sách đơn hàng.</div><button type="button">Thử lại</button>';
       else slot.innerHTML = ${JSON.stringify(table)};`
    : `slot.innerHTML = ${JSON.stringify(table)};`;
  return html(
    `<h1>Đơn hàng</h1><button type="button">Tạo đơn hàng</button><div id="slot"></div><script>var slot = document.getElementById('slot'); ${states}</script>`,
    'button{font:inherit;height:32px;padding:0 12px} table{border-collapse:collapse;margin-top:12px} th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap} a{color:#1d4ed8}'
  );
}

// A detail page: label–value fields (a row header and one value, as SKILL.md asks) and a list of order lines that
// follows ?state=. The fields stay in every state; only the lines empty, load or fail. rowHeaders: the lines' first
// column is a row header too, so a data row with a row header still counts as a data row.
function detailStatePage({ rowHeaders = false, ignoreState = false } = {}) {
  const fields = [['Customer', 'Minh Phat'], ['Channel', 'Online'], ['Payment terms', 'Net 30']]
    .map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`)
    .join('');
  const cell = rowHeaders ? 'th scope="row"' : 'td';
  const lines = `<table><thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><${cell}>Paper A4</${cell.split(' ')[0]}><td>10</td><td>650.000</td></tr><tr><${cell}>Ink</${cell.split(' ')[0]}><td>2</td><td>480.000</td></tr></tbody></table>`;
  return html(
    `<h1>Order SO-1043</h1><table><tbody>${fields}</tbody></table><h2>Lines</h2><div id="slot"></div>
<script>var slot = document.getElementById('slot'); var state = ${ignoreState ? 'null' : "new URLSearchParams(location.search).get('state')"};
if (state === 'loading') slot.innerHTML = '<div aria-busy="true"><div style="height:40px;background:#f1f5f9"></div></div>';
else if (state === 'empty') slot.innerHTML = '<p>No lines yet.</p><button type="button">Add line</button>';
else if (state === 'error') slot.innerHTML = '<div role="alert">Lines could not be loaded.</div><button type="button">Retry</button>';
else slot.innerHTML = ${JSON.stringify(lines)};</script>`,
    'button{font:inherit;height:32px;padding:0 12px} table{border-collapse:collapse;margin-top:12px} th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap}'
  );
}

// A list page that does what --checks looks for, with no special markup: a search that empties the table, says so and
// updates "3 orders"; Export with its count; print CSS that hides the shell; Delete that opens a dialog; a status
// region. Each option breaks one part. native: Delete asks with the browser's confirm() instead of a dialog. api: a
// delete also sends DELETE /api/orders/<id> to the test server, which records it in `mutations`.
function checksPage({ count = true, exportCount = true, confirmDelete = true, native = false, printCss = true, live = true, noResults = true, api = false } = {}) {
  const data = JSON.stringify([{ id: 'SO-1', c: 'Minh Phat' }, { id: 'SO-2', c: 'Hoa Binh' }, { id: 'SO-3', c: 'An Khang' }]);
  const send = api ? "fetch('/api/orders/' + id, { method: 'DELETE' });" : '';
  const onDelete = native
    ? `if (confirm('Delete order ' + id + '?')) { ${send} b.closest('tr').remove(); }`
    : confirmDelete
      ? "pending = id; document.getElementById('dlg').hidden = false; document.getElementById('cancel').focus();"
      : `${send} b.closest('tr').remove();`;
  return html(
    `<nav aria-label="Order views"><a href="#all">All orders</a></nav>
<h1>Orders</h1>
<button type="button">Print</button>
<button type="button">${exportCount ? 'Export <span id="ec">3</span> orders' : 'Export'}</button>
<input type="search" id="q" aria-label="Search orders">
${count ? '<p><span id="n">3</span> orders</p>' : ''}
<table><thead><tr><th>Order</th><th>Customer</th><th>Actions</th></tr></thead><tbody id="rows"></tbody></table>
<div id="none" hidden>${noResults ? '<p>No orders match this search</p><button type="button" id="clear">Clear search</button>' : ''}</div>
${live ? '<div role="status" id="live"></div>' : ''}
<div role="alertdialog" aria-modal="true" aria-labelledby="dt" id="dlg" hidden><h2 id="dt">Delete order?</h2><button type="button" id="cancel">Cancel</button><button type="button" id="really">Delete order</button></div>
<script>
var data = ${data};
var pending = null;
document.getElementById('really').addEventListener('click', function () { var id = pending; ${send} document.getElementById('dlg').hidden = true; });
function render(list) {
  document.getElementById('rows').innerHTML = list.map(function (r) { return '<tr><td>' + r.id + '</td><td>' + r.c + '</td><td><button type="button" class="del" data-id="' + r.id + '">Delete</button></td></tr>'; }).join('');
  if (document.getElementById('n')) document.getElementById('n').textContent = list.length;
  if (document.getElementById('ec')) document.getElementById('ec').textContent = list.length;
  document.getElementById('none').hidden = list.length > 0;
  document.querySelectorAll('.del').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-id'); ${onDelete} }); });
}
render(data);
document.getElementById('q').addEventListener('input', function (e) { var q = e.target.value.toLowerCase(); render(data.filter(function (r) { return (r.id + r.c).toLowerCase().indexOf(q) >= 0; })); });
</script>`,
    `${printCss ? '@media print { nav, button, input { display: none !important } }' : ''} button,input{font:inherit;height:32px;padding:0 12px} table{border-collapse:collapse;margin-top:12px} th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap}`
  );
}

const PAGES = {
  '/detail-states': () => detailStatePage(),
  '/detail-stateless-row-headers': () => detailStatePage({ rowHeaders: true, ignoreState: true }),
  '/checks': () => checksPage(),
  '/checks-no-count': () => checksPage({ count: false }),
  '/checks-no-message': () => checksPage({ noResults: false }),
  '/checks-export': () => checksPage({ exportCount: false }),
  '/checks-print': () => checksPage({ printCss: false }),
  '/checks-no-confirm': () => checksPage({ confirmDelete: false }),
  '/checks-native': () => checksPage({ native: true }),
  '/checks-no-live': () => checksPage({ live: false }),
  // The same pages backed by the test server's /api: Delete at once, after a dialog, or after the browser's confirm().
  '/checks-api-now': () => checksPage({ confirmDelete: false, api: true }),
  '/checks-api-dialog': () => checksPage({ api: true }),
  '/checks-api-native': () => checksPage({ native: true, api: true }),
  // Nothing to search, export, print or delete: those checks are skipped. A status region is still needed.
  '/checks-settings': () => html('<h1>Clinic settings</h1><form><label>Clinic name <input value="An Khang"></label></form><div role="status"></div>'),
  // Removing a form line or a filter chip is undone in place and needs no confirmation.
  '/checks-remove-line': () =>
    html('<h1>New order</h1><button type="button" aria-label="Remove line 1" onclick="this.remove()">×</button><button type="button" onclick="this.remove()">Remove filter: Online</button><div role="status"></div>'),
  '/clean': () => readFileSync(CLEAN, 'utf8'),
  '/new': () => readFileSync(CLEAN, 'utf8'),
  // The only issue: one ALL-CAPS label, a warning.
  '/caps': () => html('<h1>Tổng quan</h1><p><span style="text-transform:uppercase">Trạng thái</span> của kho Hà Nội hôm nay.</p>'),
  // Mock data: a skeleton for 300 ms, then a table whose amounts are left-aligned (an error the audit must see).
  '/skeleton': () =>
    html(
      '<h1>Đơn hàng</h1><div id="slot"><div aria-busy="true" style="height:40px;background:#f1f5f9"></div></div>' +
        `<script>setTimeout(function () { document.getElementById('slot').innerHTML = '<table><thead><tr><th>Khách hàng</th><th style="width:240px">Tổng tiền</th></tr></thead><tbody><tr><td>Minh Phát</td><td>1.250.000</td></tr><tr><td>An Bình</td><td>980.000</td></tr></tbody></table>'; }, 300);</script>`,
      'table{border-collapse:collapse} th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap}'
    ),
  // Never settles: a skeleton that stays and a clock that ticks every 100 ms.
  '/never': () =>
    html('<h1>Đơn hàng</h1><div aria-busy="true" style="height:40px;background:#f1f5f9"></div><p id="clock">0</p><script>var n = 0; setInterval(function () { document.getElementById("clock").textContent = String(++n); }, 100);</script>'),
  // Mock data behind a text placeholder, after 1 s: the benchmark waits for network idle (+500 ms) and sees the table.
  '/late': () =>
    html(
      '<h1>Đơn hàng</h1><div id="slot"><p>Đang tải dữ liệu…</p></div>' +
        `<script>setTimeout(function () { document.getElementById('slot').innerHTML = '<table><thead><tr><th>Khách hàng</th><th style="width:240px">Tổng tiền</th></tr></thead><tbody><tr><td>Minh Phát</td><td>1.250.000</td></tr><tr><td>An Bình</td><td>980.000</td></tr></tbody></table>'; }, 1000);</script>`,
      'table{border-collapse:collapse} th,td{height:40px;padding:0 12px;text-align:left;white-space:nowrap}'
    ),
  // Clean in the benchmark's light 1440×900 screen; fails in dark mode (contrast) or on an 800×600 screen (ALL CAPS).
  '/media': () =>
    html(
      '<h1>Tổng quan</h1><p>Mọi chỉ số của kho Hà Nội đều bình thường.</p>' +
        `<script>if (screen.width < 1440) document.querySelector('main').insertAdjacentHTML('beforeend', '<p style="text-transform:uppercase">Màn hình hẹp</p>');</script>`,
      '@media (prefers-color-scheme: dark) { html { background: #000; color: #1f2937 } }'
    ),
  '/alert': () => html('<h1>Tổng quan</h1><p>Mọi chỉ số của kho Hà Nội đều bình thường.</p><script>alert("Xin chào");</script>'),
  // A script that never yields once the page has loaded.
  '/busy': () => html('<h1>Tổng quan</h1><p>Đang tính toán.</p><script>addEventListener("load", function () { setTimeout(function () { for (;;) {} }, 0); });</script>'),
  // The Tailwind Play CDN fails to load (here: a 404), so the page has none of its styles.
  '/tailwind': () => html('<h1>Tổng quan</h1><p>Mọi chỉ số đều bình thường.</p><script src="/cdn.tailwindcss.com/3.4.17"></script>'),
  // Mock data with every state reachable through ?state=, as SKILL.md asks; and the same page without them.
  // An image that never loads, so the load event never fires.
  '/slow-load': () => html('<h1>Tổng quan</h1><p>Mọi chỉ số đều bình thường.</p><img src="/hang" alt="" width="1" height="1">'),
  '/stateful': () => statePage(true),
  '/stateless': () => statePage(false),
  // Two pages of one origin: the first stores a value, the second shows an ALL-CAPS notice when it can read it.
  '/store-a': () => html('<h1>Tổng quan</h1><p>Mọi chỉ số đều bình thường.</p><script>localStorage.setItem("eaui", "1"); document.cookie = "eaui=1; path=/";</script>'),
  '/store-b': () =>
    html(
      '<h1>Tổng quan</h1><p>Mọi chỉ số đều bình thường.</p>' +
        `<script>if (localStorage.getItem('eaui') || document.cookie.indexOf('eaui=') >= 0) document.querySelector('main').insertAdjacentHTML('beforeend', '<p style="text-transform:uppercase">Dữ liệu cũ</p>');</script>`
    ),
};

let server;
let base;
// Every request to /api other than GET, HEAD and OPTIONS that reached the server, as "DELETE /api/orders/SO-1".
const mutations = [];

before(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname; // ?state= and other parameters are for the page's script
    if (path === '/hang') return; // never answers, so a page with <img src="/hang"> never fires its load event
    if (path.startsWith('/api/')) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) mutations.push(`${req.method} ${path}`);
      return res.writeHead(204).end();
    }
    if (path === '/old') return res.writeHead(302, { location: '/new' }).end();
    const page = PAGES[path];
    if (!page) return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections(); // the /hang requests stay open otherwise
  return new Promise((resolve) => server.close(resolve));
});

test('fixtures through the CLI match their declared rules', async () => {
  const groups = new Map();
  for (const f of loadFixtures()) groups.set(f.pageType, [...(groups.get(f.pageType) || []), f]);
  for (const [pageType, fixtures] of groups) {
    const { stdout, stderr } = await run(['--json', ...(pageType ? ['--type', pageType] : []), ...fixtures.map((f) => f.path)]);
    const pages = JSON.parse(stdout || '[]');
    assert.equal(pages.length, fixtures.length, `pageType ${pageType}: one result per fixture\n${stderr}`);
    fixtures.forEach((f, i) => {
      assert.equal(pages[i].error, null, `${f.file}: ${pages[i].error}`);
      assert.deepEqual(pages[i].result.violations.map((v) => v.rule).sort(), f.expected, f.file);
    });
  }
});

test('exit 0 on a clean page, 1 on an error', async () => {
  assert.equal((await run([CLEAN, '--type', 'list'])).code, 0);
  const tells = await run([join(FIXTURES, 'list-template-tells.html'), '--type', 'list']);
  assert.equal(tells.code, 1, tells.output);
  assert.match(tells.stdout, /✗ table-above-fold/);
});

test('warnings fail only with --strict', async () => {
  const relaxed = await run([`${base}/caps`]);
  assert.equal(relaxed.code, 0, relaxed.output);
  assert.match(relaxed.stdout, /! uppercase-text/);
  assert.equal((await run([`${base}/caps`, '--strict'])).code, 1);
});

test('a missing file exits 2', async () => {
  const r = await run(['no-such-page.html']);
  assert.equal(r.code, 2);
  assert.match(r.output, /File not found/);
});

test('an unknown --type exits 2 and lists the types', async () => {
  const r = await run([CLEAN, '--type', 'lists']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /list, detail, form, dashboard/);
});

test('an HTTP error exits 2', async () => {
  const r = await run([`${base}/missing`]);
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /HTTP 404/);
});

test('a refused connection exits 2', async () => {
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const r = await run([`http://127.0.0.1:${port}/orders`]);
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /ERR_CONNECTION_REFUSED/);
  assert.ok(r.ms < 30000, `took ${r.ms} ms`);
});

test('the CLI exits as soon as its work is done', async () => {
  // A refused connection needs no settling: the run is launch + one failed navigation + close.
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  const r = await run([`http://127.0.0.1:${port}/orders`]);
  assert.equal(r.code, 2, r.output);
  assert.ok(r.ms < 8000, `took ${r.ms} ms; a timer left running keeps the process alive`);
});

test('pages in one run do not share storage or cookies', async () => {
  const r = await run([`${base}/store-a`, `${base}/store-b`, '--json']);
  const pages = JSON.parse(r.stdout);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].result.violations.map((v) => v.rule), [], pages[1].result.summary);
});

test('--states checks ?state=empty, error and loading on a page that has them', async () => {
  const r = await run([`${base}/stateful`, '--type', 'list', '--states']);
  assert.equal(r.code, 0, r.output);
  for (const line of [/✓ empty/, /✓ error/, /✓ loading/]) assert.match(r.stdout, line);
  const json = JSON.parse((await run([`${base}/stateful`, '--type', 'list', '--states', '--json'])).stdout);
  assert.deepEqual(json[0].states.map((s) => [s.state, s.ok]), [['empty', true], ['error', true], ['loading', true]]);
  assert.match(json[0].states[0].url, /\/stateful\?state=empty$/);
});

test('--states fails a page that ignores ?state=', async () => {
  const r = await run([`${base}/stateless`, '--type', 'list', '--states']);
  assert.equal(r.code, 1, r.output);
  assert.match(r.stdout, /✗ empty: \?state=empty shows the same page as without it/);
  assert.match(r.stdout, /✗ error:/);
  assert.match(r.stdout, /✗ loading:/);
});

test('a page that does not finish within --timeout stops the browser, and the next page still gets audited', async () => {
  const before = new Set(profiles());
  const r = await run([`${base}/slow-load`, CLEAN, '--type', 'list', '--timeout', '3', '--json']);
  assert.deepEqual(profiles().filter((name) => !before.has(name)), [], 'the stopped browser\'s profile is removed too');
  assert.equal(r.code, 2, r.output);
  assert.ok(r.ms < 20000, `took ${r.ms} ms`);
  const [slow, clean] = JSON.parse(r.stdout);
  assert.match(slow.error, /did not finish within 3 s/);
  assert.equal(clean.error, null, 'a new browser audits the next page');
  assert.equal(clean.result.score, 100);
});

test('--states: a detail page keeps its label–value fields in ?state=empty; they are not data rows', async () => {
  const [page] = JSON.parse((await run([`${base}/detail-states`, '--type', 'detail', '--states', '--json'])).stdout);
  assert.deepEqual(page.states.map((s) => [s.state, s.ok, s.problems.join('; ')]), [['empty', true, ''], ['error', true, ''], ['loading', true, '']]);
});

test('--states: data rows whose first cell is a row header still count as data rows', async () => {
  // The page ignores ?state=, so ?state=empty still shows its 2 order lines (and its 3 fields, which do not count).
  const [page] = JSON.parse((await run([`${base}/detail-stateless-row-headers`, '--type', 'detail', '--states', '--json'])).stdout);
  assert.match(page.states[0].problems.join('; '), /(^|; )2 data rows still show/);
});

test('without --states, no state is checked', async () => {
  const [page] = JSON.parse((await run([`${base}/stateless`, '--type', 'list', '--json'])).stdout);
  assert.equal(page.states, null);
});

// The test server's data is disposable, so --checks may click Delete; pass [] for the default, which does not.
const checksOf = async (path, type = 'list', extra = ['--disposable']) => {
  const r = await run([`${base}${path}`, '--type', type, '--checks', ...extra, '--json']);
  const [page] = JSON.parse(r.stdout || '[]');
  assert.ok(page && page.checks, `${path}: no checks in the output\n${r.output}`);
  return Object.fromEntries(page.checks.map((c) => [c.check, c]));
};

test('--checks passes a list page that searches, exports, prints, confirms and announces as SKILL.md asks', async () => {
  const c = await checksOf('/checks');
  for (const id of ['search', 'export', 'print', 'confirm', 'live-region']) {
    assert.equal(c[id].ok && !c[id].skipped && !c[id].error, true, `${id}: ${JSON.stringify(c[id])}`);
  }
  const r = await run([`${base}/checks`, '--type', 'list', '--checks', '--disposable']);
  assert.match(r.stdout, /Checks:\n✓ search: [^\n]+\n✓ export: "Export 3 orders"\n✓ print: [^\n]+\n✓ confirm: "Delete" opens a dialog first\n✓ live-region:/);
});

test('--checks fails each part a page leaves out, and only that part', async () => {
  for (const [path, id, problem] of [
    ['/checks-no-count', 'search', /no count changed/],
    ['/checks-no-message', 'search', /no "no results" message/],
    ['/checks-export', 'export', /"Export" does not name/],
    ['/checks-print', 'print', /navigation element|buttons? still print/],
    ['/checks-no-confirm', 'confirm', /"Delete" acts at once/],
    ['/checks-no-live', 'live-region', /no role="status"/],
  ]) {
    const c = await checksOf(path);
    assert.equal(c[id].ok, false, `${path}: ${id} should fail`);
    assert.match(c[id].problems.join('; '), problem, path);
    const others = Object.values(c).filter((x) => x.check !== id && !x.ok);
    assert.deepEqual(others.map((x) => x.check), [], `${path}: only ${id} fails`);
  }
  const r = await run([`${base}/checks-export`, '--type', 'list', '--checks']);
  assert.equal(r.code, 1, r.output);
});

test('--checks accepts the browser\'s own confirm() before a delete', async () => {
  const c = await checksOf('/checks-native');
  assert.equal(c.confirm.ok, true, JSON.stringify(c.confirm));
  assert.match(c.confirm.note, /confirm\(\)/);
});

test('--checks skips what a page does not have, and does not take removing a line or a filter for a delete', async () => {
  const settings = await checksOf('/checks-settings', 'settings');
  for (const id of ['search', 'export', 'print', 'confirm']) assert.equal(settings[id].skipped, true, id);
  assert.equal(settings['live-region'].ok, true);
  const form = await checksOf('/checks-remove-line', 'form');
  assert.equal(form.confirm.skipped, true, JSON.stringify(form.confirm));
});

test('--checks does not click Delete unless the data is declared --disposable, so a page that deletes at once changes nothing', async () => {
  mutations.length = 0;
  const r = await run([`${base}/checks-api-now`, '--type', 'list', '--checks']);
  assert.deepEqual(mutations, [], 'no request reached the server');
  assert.match(r.stdout, /\n\? confirm: "Delete" was not clicked[^\n]*--disposable/, r.output);
  const c = await checksOf('/checks-api-now', 'list', []);
  assert.equal(c.confirm.unverified, true, JSON.stringify(c.confirm));
  assert.deepEqual(mutations, [], 'no request reached the server');
});

test('--disposable: Delete is clicked, a page that deletes at once fails, and the request it sends is blocked', async () => {
  mutations.length = 0;
  const c = await checksOf('/checks-api-now');
  assert.equal(c.confirm.ok, false, JSON.stringify(c.confirm));
  assert.match(c.confirm.problems[0], /"Delete" acts at once/);
  assert.deepEqual(c.confirm.blocked, [`DELETE ${base}/api/orders/SO-1`]);
  assert.match(c.confirm.problems[0], /DELETE http:\/\/127\.0\.0\.1:\d+\/api\/orders\/SO-1/);
  assert.deepEqual(mutations, [], 'the blocked request never reached the server');
});

test('--disposable: neither a dialog\'s own Delete button nor a dismissed confirm() sends anything', async () => {
  mutations.length = 0;
  const dialog = await checksOf('/checks-api-dialog');
  assert.equal(dialog.confirm.ok && !dialog.confirm.skipped, true, JSON.stringify(dialog.confirm));
  const native = await checksOf('/checks-api-native');
  assert.equal(native.confirm.ok && !native.confirm.skipped, true, JSON.stringify(native.confirm));
  // Nothing was even attempted: the page itself sent no request, so none needed blocking.
  assert.deepEqual([dialog.confirm.blocked, native.confirm.blocked], [[], []]);
  assert.deepEqual(mutations, []);
});

test('without --checks, no behaviour is checked', async () => {
  const [page] = JSON.parse((await run([`${base}/checks`, '--type', 'list', '--json'])).stdout);
  assert.equal(page.checks, null);
});

test('a temp profile left by a killed run is removed by the next run', async () => {
  const stale = join(tmpdir(), `eaui-audit-left-by-a-killed-run-${process.pid}`);
  mkdirSync(stale, { recursive: true });
  const old = Date.now() / 1000 - 2 * 24 * 3600;
  utimesSync(stale, old, old);
  try {
    assert.equal((await run([CLEAN, '--type', 'list'])).code, 0);
    assert.equal(existsSync(stale), false);
  } finally {
    rmSync(stale, { recursive: true, force: true });
  }
});

test('Ctrl+C stops the run and removes its temp profile', { skip: !POSIX && 'Windows cannot send SIGINT to a child process' }, async () => {
  const before = new Set(profiles());
  const child = spawn(process.execPath, [CLI, `${base}/never`], { cwd: ROOT, env: ENV, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 3000)); // the browser is up and the page is settling
  child.kill('SIGINT');
  const code = await new Promise((resolve) => child.once('exit', (c, signal) => resolve(c ?? signal)));
  assert.equal(code, 130);
  assert.deepEqual(profiles().filter((name) => !before.has(name)), [], 'no temp profile left behind');
});

test('a browser that sends a message that is not JSON exits 2', { skip: !POSIX && 'the fake browser is a script, which Windows cannot run as a program' }, async () => {
  chmodSync(FAKE_BROWSER, 0o755);
  const r = await run([CLEAN, '--browser', FAKE_BROWSER], { env: { FAKE_BROWSER_MODE: 'garbage' } });
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /not JSON/);
});

test('a browser that ignores SIGTERM is killed, and the CLI exits', { skip: !POSIX && 'the fake browser is a script, which Windows cannot run as a program' }, async () => {
  chmodSync(FAKE_BROWSER, 0o755);
  const dir = mkdtempSync(join(tmpdir(), 'eaui-fake-'));
  const pidFile = join(dir, 'pid');
  try {
    const r = await run([CLEAN, '--browser', FAKE_BROWSER], { env: { FAKE_BROWSER_MODE: 'stubborn', FAKE_BROWSER_PID_FILE: pidFile }, timeout: 60000 });
    assert.equal(r.code, 2, r.output || `(no output; killed after ${r.ms} ms)`);
    assert.match(r.output, /Browser could not start/);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'the fake browser is no longer running');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a redirect is followed and the final page audited', async () => {
  const r = await run([`${base}/old`, '--type', 'list', '--json']);
  assert.equal(r.code, 0, r.output);
  assert.match(JSON.parse(r.stdout)[0].url, /\/new$/);
});

test('mock data that loads after a skeleton is audited once loaded', async () => {
  const r = await run([`${base}/skeleton`, '--type', 'list', '--json']);
  const [page] = JSON.parse(r.stdout);
  assert.equal(page.error, null);
  assert.ok(page.result.violations.some((v) => v.rule === 'numeric-align'), page.result.summary);
  assert.equal(page.loadingPlaceholders, 0);
});

test('a page that never settles is audited after the 8 s cap', async () => {
  const json = await run([`${base}/never`, '--json']);
  assert.ok(json.ms < 25000, `took ${json.ms} ms`);
  const [page] = JSON.parse(json.stdout);
  assert.equal(page.error, null);
  assert.ok(page.loadingPlaceholders >= 1);
  const text = await run([`${base}/never`]);
  assert.match(text.stdout, /Still loading after 8 s/);
});

test('a relative path and a path with a space work', async () => {
  const relative = await run(['list-clean.html', '--type', 'list'], { cwd: FIXTURES });
  assert.equal(relative.code, 0, relative.output);
  assert.match(relative.stdout, /Score 100\/100/);
  const dir = mkdtempSync(join(tmpdir(), 'eaui-cli-'));
  try {
    mkdirSync(join(dir, 'with space'));
    copyFileSync(CLEAN, join(dir, 'with space', 'page.html'));
    const r = await run([join(dir, 'with space', 'page.html'), '--type', 'list']);
    assert.equal(r.code, 0, r.output);
    assert.match(r.stdout, /Score 100\/100/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a program that is not a browser exits 2', async () => {
  const r = await run([CLEAN, '--browser', process.execPath]);
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /Browser could not start/);
  assert.ok(r.ms < 20000, `took ${r.ms} ms`);
});

test('the CLI runs when the skill folder is a link, as npx skills add installs it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eaui-link-'));
  const link = join(dir, 'enterprise-admin-ui');
  try {
    symlinkSync(join(ROOT, 'skills/enterprise-admin-ui'), link, 'junction'); // a junction on Windows, a symlink elsewhere
    const r = await run([join(FIXTURES, 'list-template-tells.html'), '--type', 'list'], { cli: join(link, 'scripts', 'audit-cli.mjs') });
    assert.equal(r.code, 1, r.output || '(no output)');
    assert.match(r.stdout, /✗ table-above-fold/);
  } finally {
    // Remove the link itself first, and only then the folder, so nothing is ever deleted through the link.
    try {
      unlinkSync(link);
    } catch {
      // not created
    }
    let linkGone = true;
    try {
      lstatSync(link);
      linkGone = false;
    } catch {
      // gone
    }
    if (linkGone) rmSync(dir, { recursive: true, force: true });
  }
});

test('data that arrives 1 s after load, behind a text placeholder, is audited', async () => {
  const r = await run([`${base}/late`, '--type', 'list', '--json']);
  const [page] = JSON.parse(r.stdout);
  assert.equal(page.error, null);
  assert.ok(page.result.violations.some((v) => v.rule === 'numeric-align'), page.result.summary);
});

test('the page sees a light colour scheme and a 1440×900 screen, as in the benchmark', async () => {
  const r = await run([`${base}/media`]);
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /Score 100\/100/);
});

test('a page that opens an alert is audited', async () => {
  const r = await run([`${base}/alert`]);
  assert.equal(r.code, 0, r.output);
  assert.match(r.stdout, /Score 100\/100/);
  assert.ok(r.ms < 20000, `took ${r.ms} ms`);
});

test('a page whose script never yields exits 2', async () => {
  const r = await run([`${base}/busy`]);
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /did not respond/);
  assert.ok(r.ms < 45000, `took ${r.ms} ms`);
});

test('a server that accepts the connection and never answers exits 2', async () => {
  const sockets = new Set();
  const silent = createTcpServer((socket) => sockets.add(socket));
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  try {
    const r = await run([`http://127.0.0.1:${silent.address().port}/orders`]);
    assert.equal(r.code, 2, r.output);
    assert.match(r.output, /no response after 30 s/);
    assert.ok(r.ms < 45000, `took ${r.ms} ms`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => silent.close(resolve));
  }
});

test('a page whose Tailwind CDN did not load exits 2', async () => {
  const r = await run([`${base}/tailwind`]);
  assert.equal(r.code, 2, r.output);
  assert.match(r.output, /Tailwind CDN did not load/);
});

test('a browser path that does not exist exits 2', async () => {
  const r = await run([CLEAN, '--browser', join(tmpdir(), 'nope', 'chrome')]);
  assert.equal(r.code, 2);
  assert.match(r.output, /Browser not found/);
});
