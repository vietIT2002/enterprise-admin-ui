// Unit tests for the browser-free helpers of scripts/audit-cli.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PAGE_TYPES, UsageError, exitCode, findBrowser, parseCli, toUrl } from '../skills/enterprise-admin-ui/scripts/audit-cli.mjs';
import { ROOT } from '../tools/build-adapters.mjs';

const FIXTURES = join(ROOT, 'tests/fixtures');

test('PAGE_TYPES lists the 11 page types in order', () => {
  assert.deepEqual([...PAGE_TYPES], ['list', 'detail', 'form', 'dashboard', 'settings', 'wizard', 'report', 'document', 'calendar', 'board', 'tree']);
});

test('parseCli: targets and flags', () => {
  assert.deepEqual(parseCli(['a.html', '--type', 'list']), { targets: ['a.html'], pageType: 'list', json: false, strict: false, browser: null, help: false });
  const all = parseCli(['--json', '--strict', '--browser', '/x/chrome', 'a', 'b']);
  assert.deepEqual(all, { targets: ['a', 'b'], pageType: null, json: true, strict: true, browser: '/x/chrome', help: false });
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

const page = (violations, error = null) => ({ target: 'p', url: 'u', error, loadingPlaceholders: 0, result: error ? null : { violations } });

test('exitCode: 0 clean, 1 on errors (or warnings with strict), 2 when a page could not be audited', () => {
  assert.equal(exitCode([page([])], false), 0);
  assert.equal(exitCode([page([{ rule: 'uppercase-text', severity: 'warn' }])], false), 0);
  assert.equal(exitCode([page([{ rule: 'uppercase-text', severity: 'warn' }])], true), 1);
  assert.equal(exitCode([page([{ rule: 'numeric-align', severity: 'error' }])], false), 1);
  assert.equal(exitCode([page([]), page(null, 'HTTP 404 from u')], false), 2);
  assert.equal(exitCode([page([{ rule: 'numeric-align', severity: 'error' }]), page(null, 'HTTP 404 from u')], true), 2);
});
