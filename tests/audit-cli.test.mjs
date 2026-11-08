// End-to-end tests for scripts/audit-cli.mjs: the CLI runs as a child process, as an agent would run it.
// The browser is Playwright's Chromium when it is installed (CI), else whatever the CLI finds on the machine.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
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

function run(args, { cwd = ROOT, timeout = 90000, cli = CLI } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args], { cwd, env: ENV, timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr, output: stdout + stderr, ms: Date.now() - started });
    });
  });
}

const BASE_STYLE = `[hidden]{display:none!important} html{font:14px/20px system-ui,sans-serif;color:#0f172a;background:#fff} body{margin:0} main{padding:16px 24px} h1{font-size:20px;line-height:28px;font-weight:600;margin:0 0 16px}`;
const html = (body, style = '') => `<!doctype html><html lang="vi-VN"><head><meta charset="utf-8"><title>t</title><style>${BASE_STYLE}${style}</style></head><body><main>${body}</main></body></html>`;

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
};

let server;
let base;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/old') return res.writeHead(302, { location: '/new' }).end();
    const page = PAGES[req.url];
    if (!page) return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

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
  assert.ok(r.ms < 4000, `took ${r.ms} ms; a timer left running keeps the process alive`);
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
