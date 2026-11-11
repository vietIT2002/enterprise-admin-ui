#!/usr/bin/env node
/*!
 * enterprise-admin-ui audit CLI — MIT License
 * Runs scripts/audit.js on pages in an installed headless Chrome, Edge or Chromium. No dependencies; Node 22 or later.
 *
 *   node audit-cli.mjs <url | file.html>... [--type <type>] [--states] [--checks [--disposable]] [--json] [--strict] [--browser <path>]
 *
 * --states also opens ?state=empty, error and loading; --checks also searches, exports and prints the way a person
 * would, to check the behaviour SKILL.md asks for. Neither needs special markup in the page. --checks clicks Delete
 * only with --disposable, which says the page's data is mock data or a test copy that may change; even then it blocks
 * the requests that click sends with a method other than GET, HEAD or OPTIONS.
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
        checks: { type: 'boolean' },
        disposable: { type: 'boolean' },
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
    checks: Boolean(values.checks),
    disposable: Boolean(values.disposable),
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

// ------------------------------------------------------------------ behaviour checks (--checks)

// What SKILL.md asks of a screen's behaviour, tested by using the page as a person would: a search that matches
// nothing, Export, Print, a destructive action, and a region for status messages. No special markup is needed.
export const CHECKS = Object.freeze(['search', 'export', 'print', 'confirm', 'live-region']);
// No digits, so a "No orders match …" message that repeats the query does not look like a changed count.
const NO_MATCH_QUERY = 'zzqxwv';
// Passed to the page as strings. English, Vietnamese and Chinese names.
const PATTERNS = Object.freeze({
  search:
    'input[type="search"], [role="searchbox"], input[aria-label*="search" i], input[placeholder*="search" i], input[aria-label*="tìm" i], input[placeholder*="tìm" i], input[aria-label*="搜索"], input[placeholder*="搜索"]',
  exportRe: String.raw`\bexport\b|xuất|导出`,
  printRe: String.raw`\bprint\b|^in$|^in (phiếu|hóa đơn|hoá đơn|báo cáo|bảng|danh sách|trang)|打印`,
  destructiveRe: String.raw`\b(delete|remove|deactivate|terminate)\b|xóa|xoá|vô hiệu|ngừng hoạt động|删除|移除|停用`,
  // Removing a filter, a form line or a row before saving is undone in place and needs no confirmation.
  notDestructiveRe: String.raw`\bremove (filter|line|row)|(xóa|xoá) (bộ lọc|dòng)|清除筛选`,
  noResultsRe: String.raw`\bno\b.{0,60}\b(match|matches|matching|results?|found)\b|nothing (matches|found)|không (có|tìm thấy)|没有.{0,20}(结果|匹配)|无结果|未找到`,
});

// CheckResult: { check, ok, skipped, unverified, blocked: string[], problems: string[], note, error: string|null,
//   evidence: { method, basis, observed, limitation }, status?, required? }. status (pass | fail | not_applicable |
//   not_verified | error) and required are set by withRequirement / notApplicable, not by the judge functions. A
// skipped check is ok. unverified: the page has what the check needs, but the check did not run, so nothing was
// verified (the note says why). blocked: requests the check stopped before they left the browser, as "DELETE https://…".
const outcome = (check, { skipped = false, unverified = false, blocked = [], problems = [], note = '', evidence } = {}) => ({ check, ok: problems.length === 0, skipped, unverified, blocked, problems, note, error: null, evidence });

// evidence: what a check saw and what it does not establish. method: interaction | dom | print-media | manual;
// basis: direct | heuristic | manual.
const evidence = (method, basis, observed, limitation = null) => ({ method, basis, observed, limitation });
const absent = (what) => evidence('dom', 'heuristic', `no ${what} matched the name patterns`, 'the control may exist under another name');

// Adds status and required to a judged result. Undeclared (required false): a control not found or a click not made is
// not_verified. Required: a control not found fails, and a click not made stays not_verified.
export function withRequirement(result, { required = false } = {}) {
  if (result.status === 'not_applicable') return result;
  let out = { ...result, required };
  if (out.error) return { ...out, status: 'error' };
  if (required && out.skipped && !out.unverified) {
    const problem = `required ${out.check}: no matching control found`;
    out = { ...out, ok: false, problems: out.problems.includes(problem) ? out.problems : [...out.problems, problem] };
  }
  const status = out.problems.length ? 'fail' : out.unverified || out.skipped ? 'not_verified' : 'pass';
  return { ...out, status };
}

// A check the person declared not applicable: it does not run.
export function notApplicable(check) {
  const note = 'declared not applicable with --not-applicable';
  return { ...outcome(check, { skipped: true, note, evidence: evidence('manual', 'manual', note) }), status: 'not_applicable', required: false };
}

// before and after the search: { rows, numbers, noResults } from the page (data rows; short texts with a number outside
// the table body and the controls; whether it says nothing matches). Only a list must show a count that changes.
export function judgeSearch({ found, before, after, pageType = null }) {
  if (!found) return outcome('search', { skipped: true, note: 'no search box', evidence: absent('search box') });
  const problems = [];
  if (after.rows > 0) problems.push(`${after.rows} data row${after.rows === 1 ? '' : 's'} still show after a search that matches nothing`);
  if (!after.noResults) problems.push('no "no results" message, such as "No orders match this search" with Clear search');
  const changed = [...before.numbers].sort().join('\n') !== [...after.numbers].sort().join('\n');
  if (!changed && pageType === 'list') problems.push('no count changed: show how many records match ("12 of 48 orders") and update it on every search');
  return outcome('search', {
    problems,
    note: `a search for "${NO_MATCH_QUERY}" empties the list and says so${changed ? ', and the count changes' : ''}`,
    evidence: evidence('interaction', 'direct', `a search for "${NO_MATCH_QUERY}" left ${after.rows} data row${after.rows === 1 ? '' : 's'}${after.noResults ? ' and a no-results message' : ' and no no-results message'}`, 'only one no-match query; real matching is not checked'),
  });
}

// names: the visible Export controls.
export function judgeExport(names) {
  if (!names.length) return outcome('export', { skipped: true, note: 'no Export control', evidence: absent('Export control') });
  const bare = names.filter((name) => !/\d/.test(name));
  const problems = bare.length ? [`"${bare[0]}" does not name what it exports: give the scope and count, as "Export 1.245 orders" or "Export 3 selected"`] : [];
  return outcome('export', {
    problems,
    note: `"${names[0]}"`,
    evidence: evidence('dom', 'direct', `the Export control reads "${names[0]}"`, "the export was not run; the file's scope and rows are not checked"),
  });
}

// printed: null without a Print control, else what shows in print media: { h1, nav, buttons }.
export function judgePrint(printed) {
  if (!printed) return outcome('print', { skipped: true, note: 'no Print control', evidence: absent('Print control') });
  const problems = [];
  if (!printed.h1) problems.push('the title (h1) does not print: keep it, with the period and totals');
  if (printed.nav) problems.push(`${printed.nav} navigation element${printed.nav === 1 ? ' still prints' : 's still print'} (hide the shell in @media print)`);
  if (printed.buttons) problems.push(`${printed.buttons} button${printed.buttons === 1 ? ' still prints' : 's still print'} (hide controls in @media print)`);
  return outcome('print', {
    problems,
    note: 'printing keeps the title and hides navigation and buttons',
    evidence: evidence('print-media', 'direct', `under print media: title ${printed.h1 ? 'shows' : 'missing'}, ${printed.nav} navigation and ${printed.buttons} button${printed.buttons === 1 ? '' : 's'} still show`, 'pagination and a full printed document are not checked'),
  });
}

// label: the first visible delete, remove or deactivate action, or null; clicked: false when it was left alone, as it
// is without --disposable; dialog: a dialog showed after the click; native: the browser's confirm() opened; blocked:
// the requests the click sent that confirmCheck stopped.
export function judgeConfirm({ label, clicked = true, dialog = false, native = false, blocked = [] }) {
  if (!label) return outcome('confirm', { skipped: true, note: 'no visible delete, remove or deactivate action', evidence: absent('delete, remove or deactivate action') });
  if (!clicked) {
    return outcome('confirm', {
      skipped: true,
      unverified: true,
      evidence: evidence('interaction', 'direct', `"${label}" was found but not clicked`, 'the click was not made without --disposable, so whether it asks first is not established'),
      note: `"${label}" was not clicked, since that could change real data. On mock data or a test copy you can reset, run again with --disposable to check that it asks first`,
    });
  }
  const sent = blocked.length ? `${blocked[0]}${blocked.length > 1 ? ` and ${blocked.length - 1} more` : ''}, which --checks blocked` : '';
  const also = sent ? `, but the click also sent ${sent}` : '';
  if (dialog) return outcome('confirm', { blocked, note: `"${label}" opens a dialog first${also}`, evidence: evidence('interaction', 'direct', `clicking "${label}" ${dialog ? 'opened a dialog' : native ? "opened the browser's confirm()" : 'acted at once'}; ${blocked.length} request${blocked.length === 1 ? '' : 's'} blocked`, 'only the first destructive control; the confirm action is never submitted') });
  if (native) return outcome('confirm', { blocked, note: `"${label}" asks with the browser's confirm()${also}; a dialog that names the record and the consequence is better`, evidence: evidence('interaction', 'direct', `clicking "${label}" ${dialog ? 'opened a dialog' : native ? "opened the browser's confirm()" : 'acted at once'}; ${blocked.length} request${blocked.length === 1 ? '' : 's'} blocked`, 'only the first destructive control; the confirm action is never submitted') });
  return outcome('confirm', {
    blocked,
    evidence: evidence('interaction', 'direct', `clicking "${label}" ${dialog ? 'opened a dialog' : native ? "opened the browser's confirm()" : 'acted at once'}; ${blocked.length} request${blocked.length === 1 ? '' : 's'} blocked`, 'only the first destructive control; the confirm action is never submitted'),
    problems: [`"${label}" acts at once${sent ? ` (it sent ${sent})` : ''}: open a dialog (role="alertdialog") that names the record and the consequence, with focus on Cancel`],
  });
}

// count: role="status", role="alert" and aria-live regions on the page.
export function judgeLive(count) {
  const problems = count ? [] : ['no role="status", role="alert" or aria-live region, so screen readers hear no messages: add <div role="status" aria-live="polite">'];
  return outcome('live-region', {
    problems,
    note: `${count} live region${count === 1 ? '' : 's'}`,
    evidence: evidence('dom', 'direct', `${count} role="status", role="alert" or aria-live region${count === 1 ? '' : 's'}`, 'whether messages are announced is not checked'),
  });
}

// PageResult: { target, url, error: string|null, loadingPlaceholders: number, result: audit result|null,
//               states: null | [{ state, url, ok, problems, details, error }], checks: null | [CheckResult] }
// A result from behaviourChecks may have no status yet: read it as undeclared.
const statusOf = (c) => c.status ?? withRequirement(c).status;

export function exitCode(pages, strict) {
  const states = (p) => p.states || [];
  const checks = (p) => p.checks || [];
  if (pages.some((p) => p.error || states(p).some((s) => s.error) || checks(p).some((c) => c.error))) return 2;
  const fails = (v) => strict || v.severity === 'error';
  return pages.some((p) => (p.result && p.result.violations.some(fails)) || states(p).some((s) => !s.ok) || checks(p).some((c) => !c.ok || statusOf(c) === 'fail' || (c.required && statusOf(c) === 'not_verified'))) ? 1 : 0;
}

function checkLine(c) {
  const name = c.required ? `${c.check} (required)` : c.check;
  const status = statusOf(c);
  if (status === 'error') return `✗ ${name}: could not check: ${c.error}`;
  if (status === 'fail') return `✗ ${name}: ${c.problems.join('; ')}`;
  if (status === 'not_verified') return `? ${name}: ${c.note}`;
  if (status === 'not_applicable') return `– ${name}: ${c.note}`;
  return `✓ ${name}: ${c.note}`;
}

// 'Checks: 2 pass · 1 fail …' (counts above zero only), then the required checks that are not shown to pass.
function checkSummary(checks) {
  const count = (s) => checks.filter((c) => statusOf(c) === s).length;
  const parts = [['pass', 'pass'], ['fail', 'fail'], ['not_verified', 'not verified'], ['not_applicable', 'not applicable'], ['error', 'error']]
    .filter(([s]) => count(s) > 0)
    .map(([s, label]) => `${count(s)} ${label}`);
  const lines = [`Checks: ${parts.join(' · ')}`];
  const reason = (c) => {
    if (statusOf(c) === 'error') return 'could not run';
    if (c.unverified) return 'run with --disposable';
    if (statusOf(c) === 'fail') return c.problems.some((p) => p.startsWith('required ')) ? 'no matching control found' : 'failed';
    return c.note;
  };
  const open = checks.filter((c) => c.required && statusOf(c) !== 'pass');
  if (open.length) lines.push(`Required but not shown to pass: ${open.map((c) => `${c.check} (${reason(c)})`).join(', ')}`);
  return lines;
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
      if (p.checks) lines.push('Checks:', ...p.checks.map(checkLine), ...(p.checks.length ? checkSummary(p.checks) : []));
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
// skeleton rows do not count, and neither do label–value rows such as "Customer | Minh Phat"); visible role="alert"
// messages; loading placeholders, counted as settleInPage does.
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
    // A row header and one value is a label–value row: a field of the record, which stays when its lists are empty.
    const labelValue = cells.length === 2 && (cells[0].tagName === 'TH' || cells[0].getAttribute('role') === 'rowheader');
    if (!labelValue && [...cells].filter((c) => clean(c.innerText)).length >= 2) rows++;
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

// Runs in the page: the controls --checks uses, outside open dialogs. A control's name is its aria-label or its text.
// Marks the first destructive action data-eaui-confirm, so confirmTargetInPage can find it.
function controlsInPage(patterns) {
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const name = (el) => clean(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title'));
  const re = (source) => new RegExp(source, 'i');
  const controls = [...document.querySelectorAll('button, a[href], [role="button"], [role="menuitem"]')].filter(
    (el) => visible(el) && !el.closest('[role="dialog"], [role="alertdialog"], dialog')
  );
  const destructive = controls.find((el) => re(patterns.destructiveRe).test(name(el)) && !re(patterns.notDestructiveRe).test(name(el)));
  if (destructive) destructive.setAttribute('data-eaui-confirm', '');
  return {
    search: [...document.querySelectorAll(patterns.search)].some(visible),
    exports: controls.map(name).filter((n) => re(patterns.exportRe).test(n)),
    print: controls.some((el) => re(patterns.printRe).test(name(el))),
    destructive: destructive ? name(destructive) : null,
    live: document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').length,
  };
}

// Runs in the page: short texts that hold a number, outside the table body, rows, controls and dialogs (a count such as
// "48 orders" or "12 of 48"), and whether the page says nothing matches.
function countsInPage(patterns) {
  const root = document.querySelector('main, [role="main"]') || document.body;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const skip = 'tbody, [role="row"], button, a, [role="button"], select, option, script, style, [role="dialog"], [role="alertdialog"], dialog';
  const numbers = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!/\d/.test(node.nodeValue) || !el || el.closest(skip) || !visible(el)) continue;
    numbers.push(clean(el.innerText).slice(0, 80));
  }
  return { numbers, noResults: new RegExp(patterns.noResultsRe, 'i').test(root.innerText) };
}

// Runs in the page: focuses the first visible search box and selects its text, so typing replaces it.
function focusSearchInPage(selector) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const el = [...document.querySelectorAll(selector)].find(visible);
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (typeof el.select === 'function') el.select();
  return document.activeElement === el;
}

// Runs in the page: the centre of the action controlsInPage marked, scrolled into view.
function confirmTargetInPage() {
  const el = document.querySelector('[data-eaui-confirm]');
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Runs in the page: whether a dialog shows.
function dialogInPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].some(visible);
}

// Runs in the page, in print media: what would print.
function printInPage() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  return {
    h1: [...document.querySelectorAll('h1')].some(visible),
    nav: [...document.querySelectorAll('nav, aside, [role="navigation"]')].filter(visible).length,
    buttons: [...document.querySelectorAll('button')].filter(visible).length,
  };
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

// The benchmark's light colour scheme, in screen and in print media.
const MEDIA_FEATURES = Object.freeze([
  { name: 'prefers-color-scheme', value: 'light' },
  { name: 'prefers-reduced-motion', value: 'no-preference' },
]);

// Opens url in a new tab of its own browser context (no storage or cookies from other targets), waits for it to load
// and settle, and returns work(send, { loadingPlaceholders, dialogs, on }); dialogs() counts the alert(), confirm() and
// prompt() dialogs the page has opened (each is dismissed); on(fn) calls fn(method, params) for each later event of the
// tab. The tab and its context close afterwards.
async function withPage(browser, url, { waitForPlaceholders = true } = {}, work) {
  const { browserContextId } = await browser.send('Target.createBrowserContext');
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params, timeoutMs) => browser.send(method, params, sessionId, timeoutMs);
    const ours = (message) => message.sessionId === sessionId;

    let navigating = false;
    let response = null;
    let dialogs = 0;
    const inflight = new Set();
    const listeners = new Set();
    const offEvents = browser.on((message) => {
      if (!ours(message)) return;
      const { method, params } = message;
      for (const fn of listeners) fn(method, params);
      if (method === 'Page.javascriptDialogOpening') {
        dialogs++;
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
      await send('Emulation.setEmulatedMedia', { media: '', features: MEDIA_FEATURES });
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
      return await work(send, { loadingPlaceholders, dialogs: () => dialogs, on: (fn) => listeners.add(fn) });
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

// After typing or clicking: wait for a debounced handler, then for the page to settle again.
const AFTER_ACTION = { quietMs: 300, capMs: 3000 };
async function settleAfterAction(send, ms) {
  await delay(ms);
  await evaluate(send, `(${settleInPage})(${JSON.stringify(AFTER_ACTION)})`, true, SETTLE_TIMEOUT_MS);
}

const controlsOf = (send) => evaluate(send, `(${controlsInPage})(${JSON.stringify(PATTERNS)})`);

// The read-only checks, from one tab: the controls, then what prints (print media last, as it changes the page).
function readControls(browser, url) {
  return withPage(browser, url, {}, async (send) => {
    const controls = await controlsOf(send);
    controls.printed = null;
    if (controls.print) {
      await send('Emulation.setEmulatedMedia', { media: 'print', features: MEDIA_FEATURES });
      controls.printed = await evaluate(send, `(${printInPage})()`);
    }
    return controls;
  });
}

// Types a search that matches nothing into the first search box, as a person would, and compares the page before and after.
function searchCheck(browser, url, pageType) {
  return withPage(browser, url, {}, async (send) => {
    const read = async () => ({
      ...(await evaluate(send, `(${countsInPage})(${JSON.stringify(PATTERNS)})`)),
      rows: (await evaluate(send, `(${snapshotInPage})()`)).rows,
    });
    const before = await read();
    if (!(await evaluate(send, `(${focusSearchInPage})(${JSON.stringify(PATTERNS.search)})`))) return judgeSearch({ found: false });
    await send('Input.insertText', { text: NO_MATCH_QUERY });
    await settleAfterAction(send, 700);
    return judgeSearch({ found: true, before, after: await read(), pageType });
  });
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Clicks the first destructive action with the mouse and looks for a dialog, or the browser's confirm(). From just
// before the click, each request the tab sends with a method other than GET, HEAD or OPTIONS is failed before it leaves
// the browser, and listed. That is a safeguard, not isolation: a GET, a WebSocket, a service worker or a frame of its
// own can still change data, which is why the click needs --disposable.
function confirmCheck(browser, url) {
  return withPage(browser, url, {}, async (send, { dialogs, on }) => {
    const { destructive } = await controlsOf(send);
    const point = destructive ? await evaluate(send, `(${confirmTargetInPage})()`) : null;
    if (!point) return judgeConfirm({ label: null });
    const blocked = [];
    on((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const { requestId, request } = params;
      if (READ_METHODS.has(request.method)) {
        send('Fetch.continueRequest', { requestId }).catch(() => {});
      } else {
        blocked.push(`${request.method} ${request.url}`);
        send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const before = dialogs();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await settleAfterAction(send, 400);
    const dialog = await evaluate(send, `(${dialogInPage})()`);
    return judgeConfirm({ label: destructive, dialog, native: dialogs() > before, blocked });
  });
}

// The five checks of CHECKS, in order, each tab under the same per-page time limit. A check that fails to run gets an error.
// Only with disposable is the destructive action clicked; without it, confirm is unverified.
async function behaviourChecks(limited, url, pageType, disposable) {
  const failed = (check, err) => ({ check, ok: false, skipped: false, unverified: false, blocked: [], problems: [], note: '', error: err.message });
  let controls;
  try {
    controls = await limited((b) => readControls(b, url));
  } catch (err) {
    return CHECKS.map((check) => failed(check, err));
  }
  const attempt = async (check, work) => {
    try {
      return await limited(work);
    } catch (err) {
      return failed(check, err);
    }
  };
  return [
    controls.search ? await attempt('search', (b) => searchCheck(b, url, pageType)) : judgeSearch({ found: false }),
    judgeExport(controls.exports),
    judgePrint(controls.printed),
    !controls.destructive
      ? judgeConfirm({ label: null })
      : disposable
        ? await attempt('confirm', (b) => confirmCheck(b, url))
        : judgeConfirm({ label: controls.destructive, clicked: false }),
    judgeLive(controls.live),
  ];
}

// One browser for all targets, a new tab for each. A target that fails gets an error; a browser that cannot start rejects.
// With states, each page that was audited is also opened with ?state=empty, error and loading; with checks, it gets the
// behaviour checks. Each page, state and check tab gets at most timeoutS; one that takes longer may have hung the
// browser, so it is stopped and a new one started.
export async function auditTargets(targets, { pageType = null, browser: executable, states = false, checks = false, disposable = false, timeoutS = DEFAULT_PAGE_TIMEOUT_S }) {
  const pages = targets.map((target) => {
    try {
      return { target, url: toUrl(target), error: null, loadingPlaceholders: 0, result: null, states: null, checks: null };
    } catch (err) {
      return { target, url: null, error: err.message, loadingPlaceholders: 0, result: null, states: null, checks: null };
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
      if (states) {
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
      if (checks) page.checks = await behaviourChecks(limited, page.url, pageType, disposable);
    }
  } finally {
    if (browser) await browser.close();
  }
  return pages;
}

// ------------------------------------------------------------------ command line

const HELP = `Usage: node audit-cli.mjs <url | file.html>... [--type <type>] [--states] [--checks [--disposable]] [--json] [--strict] [--browser <path>]

Audits each page with enterprise-admin-ui's audit.js in a headless Chrome, Edge or Chromium at 1440×900.

  <url | file.html>  an http(s) URL, such as a running dev server, or a local HTML file
  --type <type>      the page type: ${PAGE_TYPES.join(', ')}
  --json             print the full results as JSON
  --strict           exit 1 on warnings too
  --states           also open the page with ?state=empty, ?state=error and ?state=loading and check each state:
                     a changed page; empty: no data rows and an action of its own; error: a role="alert" message
                     and Retry; loading: a skeleton. For pages with mock data, as SKILL.md asks
  --checks           also use the page as a person would and check what SKILL.md asks of its behaviour: a search that
                     matches nothing empties the list, says so and (on a list) changes the count; Export names its
                     count; Print hides navigation and buttons and keeps the title; Delete opens a dialog first (only
                     with --disposable); a role="status" region exists. A check the page gives no control for is skipped
  --disposable       the page's data is mock data or a test copy you can reset, so --checks may click Delete. Even
                     then, requests that click sends with a method other than GET, HEAD or OPTIONS are blocked, but a
                     GET, a WebSocket or a service worker can still change data: never use it on real data. Without
                     it, "? confirm" means Delete was not checked. Every run loads each page and runs its scripts
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
    pages = await auditTargets(opts.targets, { pageType: opts.pageType, browser: executable, states: opts.states, checks: opts.checks, disposable: opts.disposable, timeoutS: opts.timeout });
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
