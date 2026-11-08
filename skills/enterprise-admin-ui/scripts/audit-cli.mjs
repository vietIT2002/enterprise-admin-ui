#!/usr/bin/env node
/*!
 * enterprise-admin-ui audit CLI — MIT License
 * Runs scripts/audit.js on pages in an installed headless Chrome, Edge or Chromium. No dependencies; Node 22 or later.
 *
 *   node audit-cli.mjs <url | file.html>... [--type <type>] [--json] [--strict] [--browser <path>]
 *
 * Each page opens the way the enterprise-admin-ui benchmark opens it: a light colour scheme on a 1440×900 screen, then
 * load, network idle for 500 ms (at most 15 s), and the benchmark's settle (no DOM change for 800 ms, loading skeletons
 * gone, fonts loaded, animations finished, scrolled to the top; at most 8 s) before the audit runs. Dialogs are
 * dismissed, and a page that stops responding is reported instead of waited for. The browser is driven over the
 * DevTools protocol on a pipe, with a throwaway profile; on Linux it runs without the sandbox, as Playwright does.
 *
 * Exit code: 0 no ✗ error, 1 an ✗ error (or any violation with --strict), 2 a page could not be audited.
 */
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const PAGE_TYPES = Object.freeze(['list', 'detail', 'form', 'dashboard', 'settings', 'wizard', 'report', 'document', 'calendar', 'board', 'tree']);

// The most one page (or one ?state= variant) may take, end to end. Its steps have their own limits, but a browser that
// answers slowly at every step could otherwise keep a run going for minutes.
const DEFAULT_PAGE_TIMEOUT_S = 90;
const TIMEOUT_USAGE = `--timeout takes a number of seconds, such as --timeout ${DEFAULT_PAGE_TIMEOUT_S}.`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

// ------------------------------------------------------------------ arguments

export function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        type: { type: 'string' },
        json: { type: 'boolean' },
        strict: { type: 'boolean' },
        browser: { type: 'string' },
        states: { type: 'boolean' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    // parseArgs reads "--timeout -3" as a missing value; say what --timeout takes instead.
    throw new UsageError(/--timeout/.test(err.message) ? TIMEOUT_USAGE : err.message);
  }
  const { values, positionals } = parsed;
  const opts = {
    targets: positionals,
    pageType: values.type ?? null,
    json: Boolean(values.json),
    strict: Boolean(values.strict),
    states: Boolean(values.states),
    timeout: values.timeout === undefined ? DEFAULT_PAGE_TIMEOUT_S : Number(values.timeout),
    browser: values.browser ?? null,
    help: Boolean(values.help),
  };
  if (opts.help) return opts;
  if (!(opts.timeout > 0) || (values.timeout !== undefined && !values.timeout.trim())) throw new UsageError(TIMEOUT_USAGE);
  if (opts.pageType !== null && !PAGE_TYPES.includes(opts.pageType)) {
    throw new UsageError(`Unknown --type "${opts.pageType}". Use one of: ${PAGE_TYPES.join(', ')}.`);
  }
  if (!opts.targets.length) throw new UsageError('Give a URL or an HTML file to audit.');
  return opts;
}

// ------------------------------------------------------------------ finding a browser

const LINUX_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
const PLAYWRIGHT_BINARIES = [
  'chrome-win/chrome.exe',
  'chrome-win64/chrome.exe',
  'chrome-linux/chrome',
  'chrome-linux64/chrome',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
  'chrome-mac-x64/Chromium.app/Contents/MacOS/Chromium',
];

// Standard install locations: Chrome first, then Chromium, then Edge.
function platformCandidates(platform, env, home) {
  if (platform === 'win32') {
    const programFiles = env.PROGRAMFILES;
    const programFilesX86 = env['PROGRAMFILES(X86)'];
    const local = env.LOCALAPPDATA;
    const under = (dirs, ...parts) => dirs.filter(Boolean).map((dir) => win32.join(dir, ...parts));
    return [
      ...under([programFiles, programFilesX86, local], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...under([local], 'Chromium', 'Application', 'chrome.exe'),
      ...under([programFilesX86, programFiles], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (platform === 'darwin') {
    const apps = ['/Applications', posix.join(home, 'Applications')];
    return [
      ['Google Chrome.app', 'Google Chrome'],
      ['Chromium.app', 'Chromium'],
      ['Microsoft Edge.app', 'Microsoft Edge'],
    ].flatMap(([app, binary]) => apps.map((dir) => posix.join(dir, app, 'Contents', 'MacOS', binary)));
  }
  const dirs = String(env.PATH || '').split(':').filter(Boolean);
  return LINUX_NAMES.flatMap((name) => dirs.map((dir) => posix.join(dir, name)));
}

// Chromium downloaded by `npx playwright install chromium`, newest revision first.
function playwrightCandidates(platform, env, home, list) {
  const join = platform === 'win32' ? win32.join : posix.join;
  let root = env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) {
    if (platform === 'win32') root = env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'ms-playwright');
    else if (platform === 'darwin') root = posix.join(home, 'Library', 'Caches', 'ms-playwright');
    else root = posix.join(home, '.cache', 'ms-playwright');
  }
  if (!root) return [];
  let entries;
  try {
    entries = list(root);
  } catch {
    return [];
  }
  return entries
    .map((name) => /^chromium-(\d+)$/.exec(String(name)))
    .filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .flatMap((m) => PLAYWRIGHT_BINARIES.map((rel) => join(root, m[0], ...rel.split('/'))));
}

// The browser to drive: --browser, then CHROME_PATH (either must exist), then an installed browser, else null.
export function findBrowser({ flag = null, env = process.env, platform = process.platform, home = homedir(), exists = existsSync, list = readdirSync } = {}) {
  for (const named of [flag, env.CHROME_PATH]) {
    if (!named) continue;
    if (!exists(named)) throw new Error(`Browser not found: ${named}`);
    return named;
  }
  const found = platformCandidates(platform, env, home).find((p) => exists(p));
  return found || playwrightCandidates(platform, env, home, list).find((p) => exists(p)) || null;
}

// ------------------------------------------------------------------ targets and results

// localhost, an IP address or any host with a port: a URL written without http://.
const SCHEMELESS_URL = /^(?:(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:]+\])(?::\d+)?|[\w.-]+:\d+)(?:[/?#]|$)/i;

// A URL as given, or the path of an HTML file resolved against cwd, as a file: URL.
export function toUrl(target, cwd = process.cwd()) {
  if (/^(?:https?|file):/i.test(target)) return target;
  const path = resolve(cwd, target);
  let stat = null;
  try {
    stat = statSync(path);
  } catch {
    // missing
  }
  if (!stat) {
    const hint = SCHEMELESS_URL.test(target) ? `. To audit a URL, write the URL with http://, e.g. http://${target}` : '';
    throw new Error(`File not found: ${path}${hint}`);
  }
  if (!stat.isFile()) throw new Error(`Not a file: ${path}`);
  return pathToFileURL(path).href;
}

// ------------------------------------------------------------------ states (--states)

// The states SKILL.md asks a page with mock data to show through ?state= (States → Mock data).
export const STATES = Object.freeze(['empty', 'error', 'loading']);
const RETRY = /retry|try again|reload|thử lại|tải lại|重试|重新加载|再试/i;

// url with ?state=<state>, keeping its other parameters and its hash.
export function stateUrl(url, state) {
  const u = new URL(url);
  u.searchParams.set('state', state);
  return u.href;
}

// Compares a state's snapshot with the page's own (both from snapshotInPage): the state must change the page, and
// show what SKILL.md asks of it. Returns { state, ok, problems: string[], details }.
export function checkState(state, base, snap) {
  const problems = [];
  const details = {};
  if (snap.text === base.text) problems.push(`?state=${state} shows the same page as without it: build the ${state} state (SKILL.md, States)`);
  if (state === 'empty') {
    if (snap.rows > 0) problems.push(`${snap.rows} data row${snap.rows === 1 ? '' : 's'} still show`);
    // Its own action: a name that is new, or one that now appears more often (the header's "Create order" plus the empty state's).
    const own = Object.keys(snap.actions).filter((name) => snap.actions[name] > (base.actions[name] || 0));
    if (own.length) details.actions = own;
    else problems.push('no action of its own, such as "Create order" or "Clear filters"');
  } else if (state === 'error') {
    const retry = Object.keys(snap.actions).find((name) => RETRY.test(name));
    if (snap.alerts.length) details.alert = snap.alerts[0];
    else problems.push('no visible role="alert" message saying what failed');
    if (retry) details.retry = retry;
    else problems.push('no Retry action');
  } else if (state === 'loading') {
    if (snap.placeholders > 0) details.placeholders = snap.placeholders;
    else problems.push('no skeleton: show placeholder rows or blocks in the final layout (aria-busy="true" or animate-pulse); a spinner alone is not enough');
  }
  return { state, ok: problems.length === 0, problems, details };
}

// PageResult: { target, url, error: string|null, loadingPlaceholders: number, result: audit result|null,
//               states: null | [{ state, url, ok, problems, details, error }] }
export function exitCode(pages, strict) {
  const states = (p) => p.states || [];
  if (pages.some((p) => p.error || states(p).some((s) => s.error))) return 2;
  const fails = (v) => strict || v.severity === 'error';
  return pages.some((p) => (p.result && p.result.violations.some(fails)) || states(p).some((s) => !s.ok)) ? 1 : 0;
}

function stateLine(s) {
  if (s.error) return `✗ ${s.state}: could not audit: ${s.error}`;
  if (!s.ok) return `✗ ${s.state}: ${s.problems.join('; ')}`;
  const d = s.details;
  if (s.state === 'empty') return `✓ empty: no data rows, its own action ${d.actions.map((a) => `"${a}"`).join(', ')}`;
  if (s.state === 'error') return `✓ error: "${d.alert}" with "${d.retry}"`;
  return `✓ loading: ${d.placeholders} loading placeholder(s)`;
}

export function formatText(pages, pageType = null) {
  return pages
    .map((p) => {
      const lines = [`${p.target}  (pageType: ${pageType || 'none'})`, p.error ? `✗ Could not audit: ${p.error}` : p.result.summary];
      if (p.loadingPlaceholders > 0) {
        lines.push(`! Still loading after 8 s: ${p.loadingPlaceholders} loading placeholder(s) on the page, so the audit saw a loading state.`);
      }
      if (p.states) lines.push('States (?state=):', ...p.states.map(stateLine));
      return lines.join('\n');
    })
    .join('\n\n');
}

// ------------------------------------------------------------------ the browser

const AUDIT_JS = fileURLToPath(new URL('./audit.js', import.meta.url));
const START_TIMEOUT_MS = 15000;
const CALL_TIMEOUT_MS = 15000;
const LOAD_TIMEOUT_MS = 30000;
const NETWORK_IDLE = { quietMs: 500, timeoutMs: 15000 };
const SETTLE = { quietMs: 800, capMs: 8000 };
const SETTLE_TIMEOUT_MS = SETTLE.capMs + 10000;
const AUDIT_TIMEOUT_MS = 30000;
const VIEWPORT = { width: 1440, height: 900 };
const PROFILE_PREFIX = 'eaui-audit-';
const STALE_PROFILE_MS = 24 * 3600 * 1000;

// Browsers of this process, stopped and removed if the process is interrupted.
const ACTIVE = new Set();

// Removes temp profiles that a killed run left behind: eaui-audit-* folders older than a day. A folder still in use
// is either recent or locked by its browser; anything else in dir is never touched.
export function sweepStaleProfiles({ dir = tmpdir(), olderThanMs = STALE_PROFILE_MS, now = Date.now() } = {}) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(PROFILE_PREFIX)) continue;
    const path = join(dir, name);
    try {
      const stat = lstatSync(path); // a link is not followed
      if (stat.isDirectory() && now - stat.mtimeMs >= olderThanMs) rmSync(path, { recursive: true, force: true });
    } catch {
      // in use, or another user's
    }
  }
}

// Reads NUL-separated JSON messages from text chunks split anywhere. A message that is not JSON, or a handler that
// throws, goes to onError instead of throwing out of a stream callback.
export function createMessageReader(onMessage, onError) {
  let buffer = '';
  return (text) => {
    buffer += text;
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        onError(new Error(`The browser sent a message that is not JSON: ${raw.slice(0, 80)}`));
        continue;
      }
      try {
        onMessage(message);
      } catch (err) {
        onError(err);
      }
    }
  };
}

// Chrome features Playwright 1.64.1 turns off (chromiumSwitches.ts), minus the ones that only matter to its request
// interception: background downloads and queries of a fresh profile, Translate, media routing, relaunches that lose
// the pipe (AutoDeElevate on Windows, Edge's forced sign-in and updater).
const DISABLED_FEATURES = [
  'AvoidUnnecessaryBeforeUnloadCheckSync',
  'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider',
  'GlobalMediaControls',
  'HttpsUpgrades',
  'LensOverlay',
  'MediaRouter',
  'PaintHolding',
  'ThirdPartyStoragePartitioning',
  'Translate',
  'AutoDeElevate',
  'OptimizationHints',
  'NetworkTimeServiceQuerying',
  'AimEnabled',
  'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion',
];

// Launch flags: headless over a pipe, with the switches Playwright 1.64.1 launches Chromium with, so pages render as
// they do in the benchmark and a fresh profile does no background work (default apps, model downloads, component
// extensions). On Linux also --no-sandbox, as Playwright does: containers, root (Docker agents) and Ubuntu 24.04 CI
// cannot start Chrome's sandbox.
export function browserArgs({ platform = process.platform } = {}) {
  const args = [
    '--headless=new',
    '--remote-debugging-pipe',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-field-trial-config',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-back-forward-cache',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-component-update',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-edgeupdater',
    '--disable-extensions',
    `--disable-features=${DISABLED_FEATURES.join(',')}`,
    '--allow-pre-commit-input',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-updater-scheduler',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--no-first-run',
    '--password-store=basic',
    '--use-mock-keychain',
    '--no-service-autorun',
    '--disable-search-engine-choice-screen',
    '--edge-skip-compat-layer-relaunch',
    '--disable-infobars',
    '--disable-sync',
  ];
  if (platform === 'linux') args.push('--no-sandbox');
  return args;
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

// Waits for promise, at most ms. The timer is cleared either way, so it never keeps the process alive.
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((done) => (timer = setTimeout(done, ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

// A DevTools-protocol connection to a browser started with --remote-debugging-pipe: JSON messages separated by
// NUL bytes, written to the browser's fd 3 and read from its fd 4.
class Browser {
  static async launch(executable) {
    const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
    let child;
    try {
      child = spawn(executable, [...browserArgs(), `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    } catch (err) {
      rmSync(profile, { recursive: true, force: true });
      throw new Error(`Browser could not start (${err.code || err.message}): ${executable}`);
    }
    const browser = new Browser(child, profile);
    ACTIVE.add(browser);
    try {
      await browser.send('Browser.getVersion', {}, undefined, START_TIMEOUT_MS);
      return browser;
    } catch (err) {
      await delay(100); // let the last stderr lines arrive
      const reason = browser.exitCode ?? (err.timeout ? 'no answer in 15 s' : err.message);
      const tail = browser.stderr.trim().split(/\r?\n/).slice(-5).join('\n');
      await browser.close();
      throw new Error(`Browser could not start (${reason}): ${tail || executable}`);
    }
  }

  constructor(child, profile) {
    this.child = child;
    this.profile = profile;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.waiters = new Set();
    this.stderr = '';
    this.failure = null;
    this.exitCode = null;
    this.exited = new Promise((done) => {
      child.once('exit', (code, signal) => {
        this.exitCode = code ?? signal;
        this.fail(new Error(`Browser exited (${this.exitCode})`));
        done();
      });
      child.once('error', (err) => {
        this.exitCode = err.code || err.message;
        this.fail(err);
        done();
      });
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      this.stderr = (this.stderr + text).slice(-8000);
    });
    child.stdio[3].on('error', () => {}); // EPIPE once the browser has gone
    const input = child.stdio[4];
    input.setEncoding('utf8');
    input.on('data', createMessageReader((message) => this.dispatch(message), (err) => this.fail(err)));
    input.on('error', (err) => this.fail(err));
  }

  fail(err) {
    this.failure = this.failure || err;
    for (const { reject } of this.pending.values()) reject(this.failure);
    this.pending.clear();
    for (const cancel of this.waiters) cancel(null);
  }

  dispatch(message) {
    if (message.id !== undefined) {
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id);
      if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
      else call.resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  // A protocol call. It rejects with err.timeout = true when the browser has not answered within timeoutMs.
  send(method, params = {}, sessionId = undefined, timeoutMs = CALL_TIMEOUT_MS) {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`${method} did not respond within ${Math.round(timeoutMs / 1000)} s`), { timeout: true }));
      }, timeoutMs);
      const settle = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      this.pending.set(id, { resolve: settle(resolve), reject: settle(reject), method });
      this.child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }

  // Calls listener(message) for every event until the returned function is called.
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // { promise, cancel }: the promise gives the first event that matches, or null after timeoutMs, on cancel()
  // or when the browser goes away.
  waitFor(match, timeoutMs) {
    let cancel;
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => cancel(null), timeoutMs);
      const off = this.on((message) => match(message) && cancel(message));
      cancel = (value = null) => {
        clearTimeout(timer);
        off();
        this.waiters.delete(cancel);
        resolve(value);
      };
      this.waiters.add(cancel);
    });
    return { promise, cancel };
  }

  async close() {
    if (!this.failure) await within(this.send('Browser.close').catch(() => {}), 5000);
    if (this.exitCode === null) {
      await within(this.exited, 5000);
      if (this.exitCode === null) {
        this.child.kill();
        await within(this.exited, 2000);
      }
      if (this.exitCode === null) {
        this.child.kill('SIGKILL'); // a browser that ignores SIGTERM
        await within(this.exited, 2000);
      }
      if (this.exitCode === null) this.child.unref(); // never keep this process alive for it
    }
    for (const stream of this.child.stdio) if (stream) stream.destroy();
    this.removeProfile();
    ACTIVE.delete(this);
  }

  // On Ctrl+C or SIGTERM, or a page past --timeout: stop at once, without the protocol, and try to remove the profile.
  abort() {
    try {
      this.child.kill('SIGKILL');
    } catch {
      // already gone
    }
    this.removeProfile();
    ACTIVE.delete(this);
  }

  // On Windows the browser's helper processes hold profile files for a moment after it exits; retry for about 2 s.
  removeProfile() {
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // still held: the next run's sweep removes the folder
    }
  }
}

// Runs in the page: the benchmark's settle. Resolves with the number of loading placeholders still present.
// waitForPlaceholders: false (for ?state=loading, which holds its skeleton) counts them without waiting.
async function settleInPage({ quietMs, capMs, waitForPlaceholders = true }) {
  const started = Date.now();
  await new Promise((resolve) => {
    let quiet = null;
    let cap = null;
    const observer = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    });
    function done() {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    }
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    quiet = setTimeout(done, quietMs);
    cap = setTimeout(done, capMs);
  });
  const remaining = waitForPlaceholders ? Math.max(0, capMs - (Date.now() - started)) : 0;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  // A placeholder is a visible, text-less block of at least 12×12 px; small dots and pulsing badges with text are decoration.
  const placeholder = (el) => {
    const r = el.getBoundingClientRect();
    return visible(el) && !el.textContent.trim() && r.width >= 12 && r.height >= 12;
  };
  const count = () =>
    [...document.querySelectorAll('[aria-busy="true"]')].filter(visible).length +
    [...document.querySelectorAll('.animate-pulse')].filter((el) => !el.closest('[aria-busy="true"]') && placeholder(el)).length;
  const left = await new Promise((resolve) => {
    const end = Date.now() + remaining;
    const tick = () => {
      const n = count();
      if (n === 0 || Date.now() >= end) resolve(n);
      else setTimeout(tick, 100);
    };
    tick();
  });
  await document.fonts.ready;
  for (const animation of document.getAnimations()) {
    try {
      animation.finish();
    } catch {
      // infinite animations (spinners, pulses) cannot finish
    }
  }
  window.scrollTo(0, 0);
  // Frames do not run while a stylesheet that never answers blocks rendering, so do not wait for them forever.
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  return left;
}

// Runs in the page: whether it loads the Tailwind Play CDN, and whether that script ran.
function tailwindInPage() {
  return {
    uses: [...document.scripts].some((s) => /cdn\.tailwindcss\.com/.test(s.src)),
    loaded: typeof window.tailwind !== 'undefined',
  };
}

// Runs in the page: what checkState compares. Main-content text; visible actions (buttons and links outside navigation)
// by name with their count; data rows (two or more filled cells, so a "No orders yet" row spanning the table and
// skeleton rows do not count); visible role="alert" messages; loading placeholders, counted as settleInPage does.
function snapshotInPage() {
  const root = document.querySelector('main, [role="main"]') || document.body;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const actions = {};
  for (const el of root.querySelectorAll('button, a[href], [role="button"]')) {
    if (!visible(el) || el.disabled || el.closest('nav, [role="navigation"]')) continue;
    const name = clean(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title'));
    if (name) actions[name] = (actions[name] || 0) + 1;
  }
  let rows = 0;
  for (const row of root.querySelectorAll('tbody tr, [role="row"]')) {
    if (!visible(row) || row.closest('thead') || row.querySelector('[role="columnheader"]')) continue;
    const cells = row.querySelectorAll('td, th, [role="cell"], [role="gridcell"], [role="rowheader"]');
    if ([...cells].filter((c) => clean(c.innerText)).length >= 2) rows++;
  }
  const alerts = [...document.querySelectorAll('[role="alert"], [aria-live="assertive"]')]
    .filter((el) => visible(el) && clean(el.innerText))
    .map((el) => clean(el.innerText).slice(0, 120));
  const placeholder = (el) => {
    const r = el.getBoundingClientRect();
    return visible(el) && !el.textContent.trim() && r.width >= 12 && r.height >= 12;
  };
  const placeholders =
    [...document.querySelectorAll('[aria-busy="true"]')].filter(visible).length +
    [...document.querySelectorAll('.animate-pulse')].filter((el) => !el.closest('[aria-busy="true"]') && placeholder(el)).length;
  return { text: clean(root.innerText), actions, rows, alerts, placeholders };
}

// Resolves true once busy() has been false for quietMs, or false after timeoutMs.
async function waitForQuiet(busy, quietMs, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let since = null;
  while (Date.now() < end) {
    if (busy()) since = null;
    else if (since === null) since = Date.now();
    else if (Date.now() - since >= quietMs) return true;
    await delay(50);
  }
  return false;
}

async function evaluate(send, expression, awaitPromise = false, timeoutMs = CALL_TIMEOUT_MS) {
  let reply;
  try {
    reply = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, timeoutMs);
  } catch (err) {
    if (err.timeout) throw new Error(`The page did not respond within ${Math.round(timeoutMs / 1000)} s; a script may be stuck in a loop`);
    throw err;
  }
  const { result, exceptionDetails } = reply;
  if (exceptionDetails) {
    throw new Error(`Script in the page failed: ${(exceptionDetails.exception && exceptionDetails.exception.description) || exceptionDetails.text}`);
  }
  return result.value;
}

// Opens url in a new tab of its own browser context (no storage or cookies from other targets), waits for it to load
// and settle, and returns work(send, { loadingPlaceholders }). The tab and its context close afterwards.
async function withPage(browser, url, { waitForPlaceholders = true } = {}, work) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params, timeoutMs) => browser.send(method, params, sessionId, timeoutMs);
    const ours = (message) => message.sessionId === sessionId;

    let navigating = false;
    let response = null;
    const inflight = new Set();
    const offEvents = browser.on((message) => {
      if (!ours(message)) return;
      const { method, params } = message;
      if (method === 'Page.javascriptDialogOpening') {
        send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {}); // as Playwright does with no dialog handler
      } else if (method === 'Network.requestWillBeSent') {
        inflight.add(params.requestId);
      } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        inflight.delete(params.requestId);
      } else if (method === 'Network.responseReceived' && params.type === 'Document' && params.frameId === targetId) {
        response = params.response; // the main frame's id is the target's id
      }
    });
    const loaded = browser.waitFor((message) => navigating && ours(message) && message.method === 'Page.loadEventFired', LOAD_TIMEOUT_MS);
    try {
      await send('Page.enable');
      await send('Network.enable');
      await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false, screenWidth: VIEWPORT.width, screenHeight: VIEWPORT.height });
      await send('Emulation.setEmulatedMedia', {
        media: '',
        features: [
          { name: 'prefers-color-scheme', value: 'light' },
          { name: 'prefers-reduced-motion', value: 'no-preference' },
        ],
      });
      await send('Emulation.setFocusEmulationEnabled', { enabled: true });

      navigating = true;
      let nav;
      try {
        nav = await send('Page.navigate', { url }, LOAD_TIMEOUT_MS);
      } catch (err) {
        if (err.timeout) throw new Error(`Could not load ${url}: no response after 30 s`);
        throw err;
      }
      if (nav.errorText) throw new Error(`Could not load ${url}: ${nav.errorText}`);
      if (!(await loaded.promise) && (await evaluate(send, 'document.readyState')) === 'loading') {
        throw new Error(`Could not load ${url}: no load event after 30 s`);
      }
      if (response && response.status >= 400) throw new Error(`HTTP ${response.status} from ${response.url}`);
      // Like the benchmark's goto(networkidle): no request in flight for 500 ms, or go on after 15 s.
      await waitForQuiet(() => inflight.size > 0, NETWORK_IDLE.quietMs, NETWORK_IDLE.timeoutMs);

      const settle = { ...SETTLE, waitForPlaceholders };
      const loadingPlaceholders = await evaluate(send, `(${settleInPage})(${JSON.stringify(settle)})`, true, SETTLE_TIMEOUT_MS);
      return await work(send, { loadingPlaceholders });
    } finally {
      loaded.cancel();
      offEvents();
    }
  } finally {
    // Closes the tab with its context.
    await browser.send('Target.disposeBrowserContext', { browserContextId }, undefined, 5000).catch(() => {});
  }
}

// The page's audit; with snapshot, also the page's own snapshot that checkState compares each state with.
function auditPage(browser, url, pageType, auditSource, { snapshot = false } = {}) {
  return withPage(browser, url, {}, async (send, { loadingPlaceholders }) => {
    const tailwind = await evaluate(send, `(${tailwindInPage})()`);
    if (tailwind.uses && !tailwind.loaded) {
      throw new Error('Tailwind CDN did not load, so the page has none of its styles. Check the network and run the audit again');
    }
    await evaluate(send, auditSource);
    const result = await evaluate(send, `enterpriseAdminAudit(${JSON.stringify({ pageType })})`, false, AUDIT_TIMEOUT_MS);
    const base = snapshot ? await evaluate(send, `(${snapshotInPage})()`) : null;
    return { url: result.url, loadingPlaceholders, result, base };
  });
}

// One ?state= variant (its URL from stateUrl), checked against the page's own snapshot. ?state=loading holds its
// skeleton, so its settle does not wait for placeholders to go.
async function auditState(browser, target, state, base) {
  const snap = await withPage(browser, target, { waitForPlaceholders: state !== 'loading' }, (send) => evaluate(send, `(${snapshotInPage})()`));
  const { ok, problems, details } = checkState(state, base, snap);
  return { state, url: target, ok, problems, details, error: null };
}

// One browser for all targets, a new tab for each. A target that fails gets an error; a browser that cannot start rejects.
// With states, each page that was audited is also opened with ?state=empty, error and loading. Each page and each state
// gets at most timeoutS; one that takes longer may have hung the browser, so it is stopped and a new one started.
export async function auditTargets(targets, { pageType = null, browser: executable, states = false, timeoutS = DEFAULT_PAGE_TIMEOUT_S }) {
  const pages = targets.map((target) => {
    try {
      return { target, url: toUrl(target), error: null, loadingPlaceholders: 0, result: null, states: null };
    } catch (err) {
      return { target, url: null, error: err.message, loadingPlaceholders: 0, result: null, states: null };
    }
  });
  const todo = pages.filter((p) => !p.error);
  if (!todo.length) return pages;
  const auditSource = readFileSync(AUDIT_JS, 'utf8');
  let browser = await Browser.launch(executable);
  const limited = async (work) => {
    if (!browser) browser = await Browser.launch(executable);
    const running = work(browser);
    running.catch(() => {}); // it settles after the race once its browser is stopped
    let timer;
    try {
      return await Promise.race([
        running,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(Object.assign(new Error(`The page did not finish within ${timeoutS} s, so the browser was stopped. Raise --timeout for a slow page`), { deadline: true }));
          }, timeoutS * 1000);
        }),
      ]);
    } catch (err) {
      if (err.deadline) {
        const stopped = browser;
        browser = null;
        stopped.abort();
        await within(stopped.exited, 5000); // then its files are free
        stopped.removeProfile();
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    for (const page of todo) {
      let base;
      try {
        const audited = await limited((b) => auditPage(b, page.url, pageType, auditSource, { snapshot: states }));
        base = audited.base;
        delete audited.base;
        Object.assign(page, audited);
      } catch (err) {
        page.error = err.message;
        continue;
      }
      if (!states) continue;
      page.states = [];
      for (const state of STATES) {
        const url = stateUrl(page.url, state);
        try {
          page.states.push(await limited((b) => auditState(b, url, state, base)));
        } catch (err) {
          page.states.push({ state, url, ok: false, problems: [], details: {}, error: err.message });
        }
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  return pages;
}

// ------------------------------------------------------------------ command line

const HELP = `Usage: node audit-cli.mjs <url | file.html>... [--type <type>] [--json] [--strict] [--browser <path>]

Audits each page with enterprise-admin-ui's audit.js in a headless Chrome, Edge or Chromium at 1440×900.

  <url | file.html>  an http(s) URL, such as a running dev server, or a local HTML file
  --type <type>      the page type: ${PAGE_TYPES.join(', ')}
  --json             print the full results as JSON
  --strict           exit 1 on warnings too
  --states           also open the page with ?state=empty, ?state=error and ?state=loading and check each state:
                     a changed page; empty: no data rows and an action of its own; error: a role="alert" message
                     and Retry; loading: a skeleton. For pages with mock data, as SKILL.md asks
  --timeout <s>      give up on a page (or a state) after this many seconds and restart the browser; default ${DEFAULT_PAGE_TIMEOUT_S}
  --browser <path>   the browser to use; default CHROME_PATH, then an installed Chrome, Chromium or Edge

Exit code: 0 no ✗ error, 1 an ✗ error (or any violation with --strict), 2 a page could not be audited.`;

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseCli(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`${err.message}\nRun with --help for usage.\n`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  let executable;
  try {
    executable = findBrowser({ flag: opts.browser });
  } catch (err) {
    process.stderr.write(err.message + '\n');
    return 2;
  }
  if (!executable) {
    process.stderr.write('No Chrome, Edge or Chromium found. Install one, pass --browser <path>, or set CHROME_PATH.\n');
    return 2;
  }
  sweepStaleProfiles();
  // Ctrl+C or SIGTERM: stop the browser and remove its profile before leaving (130 and 143, as shells report them).
  const onSignal = (signal) => {
    for (const browser of ACTIVE) browser.abort();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  let pages;
  try {
    pages = await auditTargets(opts.targets, { pageType: opts.pageType, browser: executable, states: opts.states, timeoutS: opts.timeout });
  } catch (err) {
    process.stderr.write(err.message + '\n');
    return 2;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  process.stdout.write((opts.json ? JSON.stringify(pages, null, 2) : formatText(pages, opts.pageType)) + '\n');
  return exitCode(pages, opts.strict);
}

// Run as a command. Node gives import.meta.url the real path, so compare real paths: the skill folder is often a link
// (npx skills add links agent folders unless --copy is passed).
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// An unexpected error exits 2 ("could not audit"), never 1, which means the page has an ✗ error.
if (isMain()) {
  process.exitCode = await main().catch((err) => {
    process.stderr.write(`Internal error: ${(err && err.stack) || err}\n`);
    return 2;
  });
}
