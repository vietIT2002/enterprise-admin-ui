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

const PAGES = {
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

before(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname; // ?state= and other parameters are for the page's script
    if (path === '/hang') return; // never answers, so a page with <img src="/hang"> never fires its load event
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

test('without --states, no state is checked', async () => {
  const [page] = JSON.parse((await run([`${base}/stateless`, '--type', 'list', '--json'])).stdout);
  assert.equal(page.states, null);
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
