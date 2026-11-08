// Unit tests for the browser-free helpers of scripts/audit-cli.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PAGE_TYPES,
  UsageError,
  browserArgs,
  checkState,
  createMessageReader,
  exitCode,
  findBrowser,
  parseCli,
  stateUrl,
  sweepStaleProfiles,
  toUrl,
} from '../skills/enterprise-admin-ui/scripts/audit-cli.mjs';
import { ROOT } from '../tools/build-adapters.mjs';

const FIXTURES = join(ROOT, 'tests/fixtures');

test('PAGE_TYPES lists the 11 page types in order', () => {
  assert.deepEqual([...PAGE_TYPES], ['list', 'detail', 'form', 'dashboard', 'settings', 'wizard', 'report', 'document', 'calendar', 'board', 'tree']);
});

test('parseCli: targets and flags', () => {
  assert.deepEqual(parseCli(['a.html', '--type', 'list']), { targets: ['a.html'], pageType: 'list', json: false, strict: false, states: false, timeout: 90, browser: null, help: false });
  const all = parseCli(['--json', '--strict', '--states', '--timeout', '120', '--browser', '/x/chrome', 'a', 'b']);
  assert.deepEqual(all, { targets: ['a', 'b'], pageType: null, json: true, strict: true, states: true, timeout: 120, browser: '/x/chrome', help: false });
});

test('parseCli: --timeout takes a positive number of seconds', () => {
  assert.equal(parseCli(['a', '--timeout', '2.5']).timeout, 2.5);
  for (const bad of ['abc', '0', '-3', '']) {
    assert.throws(() => parseCli(['a', '--timeout', bad]), (err) => err instanceof UsageError && /--timeout takes a number of seconds/.test(err.message), bad);
  }
});

test('stateUrl sets ?state= and keeps the rest of the URL', () => {
  assert.equal(stateUrl('http://localhost:3000/orders', 'empty'), 'http://localhost:3000/orders?state=empty');
  assert.equal(stateUrl('http://localhost:3000/orders?status=late', 'error'), 'http://localhost:3000/orders?status=late&state=error');
  assert.equal(stateUrl('http://localhost:3000/orders?state=error', 'empty'), 'http://localhost:3000/orders?state=empty');
  assert.equal(stateUrl('http://localhost:3000/orders#top', 'loading'), 'http://localhost:3000/orders?state=loading#top');
  assert.equal(stateUrl('file:///D:/my%20app/orders.html', 'loading'), 'file:///D:/my%20app/orders.html?state=loading');
});

// Snapshots as the page reports them: main-content text, visible actions by name with their count, data rows,
// visible role="alert" texts and loading placeholders.
const BASE = { text: 'Đơn hàng 96 đơn hàng DH-1043 Minh Phát', actions: { 'Tạo đơn hàng': 1, 'Xuất CSV': 1 }, rows: 4, alerts: [], placeholders: 0 };
const snap = (over) => ({ ...BASE, ...over });

test('checkState: every state must change the page', () => {
  for (const state of ['empty', 'error', 'loading']) {
    const r = checkState(state, BASE, snap({}));
    assert.equal(r.ok, false, state);
    assert.match(r.problems.join('\n'), new RegExp(`\\?state=${state} shows the same page as without it`));
  }
});

test('checkState empty: no data rows, and an action of its own', () => {
  const ok = checkState('empty', BASE, snap({ text: 'Đơn hàng Chưa có đơn hàng nào', actions: { 'Tạo đơn hàng': 2, 'Xuất CSV': 1 }, rows: 0 }));
  assert.deepEqual(ok, { state: 'empty', ok: true, problems: [], details: { actions: ['Tạo đơn hàng'] } });
  const rows = checkState('empty', BASE, snap({ text: 'Đơn hàng Chưa có đơn hàng nào', actions: { 'Tạo đơn hàng': 2 }, rows: 2 }));
  assert.match(rows.problems.join('\n'), /2 data rows still show/);
  const noAction = checkState('empty', BASE, snap({ text: 'Đơn hàng Chưa có đơn hàng nào', rows: 0 }));
  assert.equal(noAction.ok, false);
  assert.match(noAction.problems.join('\n'), /no action of its own/);
  const clear = checkState('empty', BASE, snap({ text: 'Không có đơn hàng nào khớp bộ lọc', actions: { ...BASE.actions, 'Xoá bộ lọc': 1 }, rows: 0 }));
  assert.equal(clear.ok, true, 'a new name counts too');
});

test('checkState error: a role="alert" message and a Retry action', () => {
  for (const retry of ['Retry', 'Try again', 'Thử lại', 'Tải lại trang', '重试']) {
    const r = checkState('error', BASE, snap({ text: 'Đơn hàng Không tải được', alerts: ['Không tải được danh sách đơn hàng'], actions: { ...BASE.actions, [retry]: 1 } }));
    assert.equal(r.ok, true, retry);
  }
  const bare = checkState('error', BASE, snap({ text: 'Đơn hàng Có lỗi xảy ra' }));
  assert.equal(bare.ok, false);
  assert.match(bare.problems.join('\n'), /no visible role="alert" message/);
  assert.match(bare.problems.join('\n'), /no Retry action/);
});

test('checkState loading: skeleton placeholders, not only a spinner', () => {
  assert.equal(checkState('loading', BASE, snap({ text: 'Đơn hàng', placeholders: 6 })).ok, true);
  const spinner = checkState('loading', BASE, snap({ text: 'Đơn hàng Đang tải', placeholders: 0 }));
  assert.equal(spinner.ok, false);
  assert.match(spinner.problems.join('\n'), /no skeleton/);
});

test('parseCli: usage errors', () => {
  assert.throws(() => parseCli(['a', '--type', 'lists']), (err) => err instanceof UsageError && /Unknown --type "lists"/.test(err.message) && /list, detail, form/.test(err.message));
  assert.throws(() => parseCli([]), (err) => err instanceof UsageError && /Give a URL or an HTML file/.test(err.message));
  assert.throws(() => parseCli(['a', '--bogus']), UsageError);
  assert.equal(parseCli(['--help']).help, true);
});

const fakeFs = (paths, dirs = {}) => ({
  exists: (p) => paths.includes(p),
  list: (dir) => {
    if (!dirs[dir]) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return dirs[dir];
  },
});

const WIN_ENV = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
const WIN_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const WIN_EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

test('findBrowser: flag and CHROME_PATH win, and must exist', () => {
  const fs = fakeFs(['/x/chrome', '/env/chrome', '/usr/bin/chromium']);
  const linux = { platform: 'linux', home: '/home/a', ...fs };
  assert.equal(findBrowser({ ...linux, flag: '/x/chrome', env: { CHROME_PATH: '/env/chrome', PATH: '/usr/bin' } }), '/x/chrome');
  assert.throws(() => findBrowser({ ...linux, flag: '/y/chrome', env: { PATH: '/usr/bin' } }), /Browser not found: \/y\/chrome/);
  assert.equal(findBrowser({ ...linux, env: { CHROME_PATH: '/env/chrome', PATH: '/usr/bin' } }), '/env/chrome');
  assert.throws(() => findBrowser({ ...linux, env: { CHROME_PATH: '/gone/chrome', PATH: '/usr/bin' } }), /Browser not found: \/gone\/chrome/);
});

test('findBrowser: platform order', () => {
  const win = { platform: 'win32', home: 'C:\\Users\\a', env: WIN_ENV };
  assert.equal(findBrowser({ ...win, ...fakeFs([WIN_EDGE]) }), WIN_EDGE);
  assert.equal(findBrowser({ ...win, ...fakeFs([WIN_EDGE, WIN_CHROME]) }), WIN_CHROME);
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(findBrowser({ platform: 'darwin', home: '/Users/a', env: {}, ...fakeFs([mac]) }), mac);
  assert.equal(findBrowser({ platform: 'linux', home: '/home/a', env: { PATH: '/usr/local/bin:/usr/bin' }, ...fakeFs(['/usr/bin/chromium']) }), '/usr/bin/chromium');
  assert.equal(findBrowser({ platform: 'linux', home: '/home/a', env: { PATH: '/usr/bin' }, ...fakeFs([]) }), null);
  assert.equal(findBrowser({ ...win, ...fakeFs([]) }), null);
});

test('findBrowser: Playwright cache, newest revision', () => {
  const cache = '/home/a/.cache/ms-playwright';
  const chrome = `${cache}/chromium-1200/chrome-linux/chrome`;
  const fs = fakeFs([chrome, `${cache}/chromium-1100/chrome-linux/chrome`], { [cache]: ['chromium-1100', 'chromium-1200', 'ffmpeg-1010'] });
  assert.equal(findBrowser({ platform: 'linux', home: '/home/a', env: { PATH: '/usr/bin' }, ...fs }), chrome);
  const custom = '/opt/pw';
  const fs2 = fakeFs([`${custom}/chromium-1300/chrome-linux64/chrome`], { [custom]: ['chromium-1300'] });
  assert.equal(findBrowser({ platform: 'linux', home: '/home/a', env: { PATH: '', PLAYWRIGHT_BROWSERS_PATH: custom }, ...fs2 }), `${custom}/chromium-1300/chrome-linux64/chrome`);
});

test('toUrl: URLs unchanged, paths resolved against cwd and encoded, missing files rejected', () => {
  for (const url of ['http://localhost:3000/orders', 'https://example.com/a?b=1', 'file:///C:/a.html']) assert.equal(toUrl(url), url);
  assert.equal(toUrl('list-clean.html', FIXTURES), pathToFileURL(join(FIXTURES, 'list-clean.html')).href);
  const dir = mkdtempSync(join(tmpdir(), 'eaui-tourl-'));
  try {
    mkdirSync(join(dir, 'with space'));
    writeFileSync(join(dir, 'with space', 'page.html'), '<!doctype html>');
    assert.match(toUrl(join(dir, 'with space', 'page.html')), /^file:\/\/.*with%20space\/page\.html$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.throws(() => toUrl('no-such-page.html', FIXTURES), /File not found: .*no-such-page\.html/);
});

test('toUrl: a folder is not a page', () => {
  assert.throws(() => toUrl(FIXTURES), /Not a file: .*fixtures/);
});

test('toUrl: a URL without http:// gets a hint, not just "File not found"', () => {
  assert.throws(() => toUrl('localhost:3000/orders', FIXTURES), /write the URL with http:\/\/, e\.g\. http:\/\/localhost:3000\/orders/);
  assert.throws(() => toUrl('127.0.0.1:8080', FIXTURES), /http:\/\/127\.0\.0\.1:8080/);
  assert.throws(() => toUrl('pages/orders.html', FIXTURES), (err) => /File not found/.test(err.message) && !/http:\/\//.test(err.message));
});

test('createMessageReader: NUL-separated JSON, split anywhere; text that is not JSON is an error, not a throw', () => {
  const messages = [];
  const errors = [];
  const read = createMessageReader((m) => messages.push(m), (e) => errors.push(e));
  read('{"id":1,"result":{}}\0{"id":');
  assert.deepEqual(messages, [{ id: 1, result: {} }]);
  read('2,"result":{"a":"Hà Nội"}}\0');
  assert.deepEqual(messages[1], { id: 2, result: { a: 'Hà Nội' } });
  assert.doesNotThrow(() => read('this is not json\0'));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /not JSON/);
});

test('sweepStaleProfiles removes only eaui-audit-* folders older than the limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eaui-sweep-'));
  try {
    const old = Date.now() / 1000 - 2 * 24 * 3600;
    for (const name of ['eaui-audit-old', 'eaui-audit-new', 'other-old']) mkdirSync(join(dir, name));
    utimesSync(join(dir, 'eaui-audit-old'), old, old);
    utimesSync(join(dir, 'other-old'), old, old);
    sweepStaleProfiles({ dir });
    assert.equal(existsSync(join(dir, 'eaui-audit-old')), false, 'a profile older than a day is removed');
    assert.equal(existsSync(join(dir, 'eaui-audit-new')), true, 'a recent profile may belong to a run in progress');
    assert.equal(existsSync(join(dir, 'other-old')), true, 'other folders are never touched');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('browserArgs: headless over a pipe, plus what each platform needs (as Playwright launches Chromium)', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    const args = browserArgs({ platform });
    for (const flag of ['--headless=new', '--remote-debugging-pipe', '--hide-scrollbars', '--disable-dev-shm-usage']) assert.ok(args.includes(flag), `${platform}: ${flag}`);
  }
  assert.ok(browserArgs({ platform: 'linux' }).includes('--no-sandbox'), 'containers and root (Docker agents, CI) cannot start the sandbox');
  assert.ok(!browserArgs({ platform: 'win32' }).includes('--no-sandbox'));
  assert.ok(!browserArgs({ platform: 'darwin' }).includes('--no-sandbox'));
  for (const flag of ['--use-mock-keychain', '--password-store=basic']) assert.ok(browserArgs({ platform: 'darwin' }).includes(flag), `darwin: ${flag}`);
  assert.ok(browserArgs({ platform: 'win32' }).includes('--edge-skip-compat-layer-relaunch'));
  const disabled = (platform) => (browserArgs({ platform }).find((a) => a.startsWith('--disable-features=')) || '').slice('--disable-features='.length).split(',');
  assert.ok(disabled('win32').includes('AutoDeElevate'), 'win32: AutoDeElevate');
});

test('browserArgs: a fresh profile does no background work (default apps, model downloads, component extensions), as with Playwright', () => {
  for (const platform of ['linux', 'darwin', 'win32']) {
    const args = browserArgs({ platform });
    for (const flag of ['--disable-default-apps', '--disable-component-extensions-with-background-pages', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-hang-monitor', '--disable-field-trial-config']) {
      assert.ok(args.includes(flag), `${platform}: ${flag}`);
    }
    const features = args.filter((a) => a.startsWith('--disable-features='));
    assert.equal(features.length, 1, 'one --disable-features flag: Chrome reads only the last one');
    for (const feature of ['OptimizationHints', 'NetworkTimeServiceQuerying', 'Translate', 'MediaRouter']) assert.ok(features[0].split(/[=,]/).includes(feature), `${platform}: ${feature}`);
  }
});

const page = (violations, error = null) => ({ target: 'p', url: 'u', error, loadingPlaceholders: 0, result: error ? null : { violations } });

test('exitCode: 0 clean, 1 on errors (or warnings with strict), 2 when a page could not be audited', () => {
  assert.equal(exitCode([page([])], false), 0);
  assert.equal(exitCode([page([{ rule: 'uppercase-text', severity: 'warn' }])], false), 0);
  assert.equal(exitCode([page([{ rule: 'uppercase-text', severity: 'warn' }])], true), 1);
  assert.equal(exitCode([page([{ rule: 'numeric-align', severity: 'error' }])], false), 1);
  assert.equal(exitCode([page([]), page(null, 'HTTP 404 from u')], false), 2);
  assert.equal(exitCode([page([{ rule: 'numeric-align', severity: 'error' }]), page(null, 'HTTP 404 from u')], true), 2);
});

test('exitCode: a state that fails exits 1; a state page that could not load exits 2', () => {
  const withStates = (states) => ({ ...page([]), states });
  assert.equal(exitCode([withStates([{ state: 'empty', ok: true, problems: [], error: null }])], false), 0);
  assert.equal(exitCode([withStates([{ state: 'error', ok: false, problems: ['no Retry action'], error: null }])], false), 1);
  assert.equal(exitCode([withStates([{ state: 'loading', ok: false, problems: [], error: 'HTTP 500 from u' }])], false), 2);
});
