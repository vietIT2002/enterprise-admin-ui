#!/usr/bin/env node
/*!
 * enterprise-admin-ui audit CLI — MIT License
 * Runs scripts/audit.js on pages in an installed headless Chrome, Edge or Chromium. No dependencies; Node 22 or later.
 *
 *   node audit-cli.mjs <url | file.html>... [--type <type>] [--json] [--strict] [--browser <path>]
 *
 * Exit code: 0 no ✗ error, 1 an ✗ error (or any violation with --strict), 2 a page could not be audited.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const PAGE_TYPES = Object.freeze(['list', 'detail', 'form', 'dashboard', 'settings', 'wizard', 'report', 'document', 'calendar', 'board', 'tree']);

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
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
  const { values, positionals } = parsed;
  const opts = {
    targets: positionals,
    pageType: values.type ?? null,
    json: Boolean(values.json),
    strict: Boolean(values.strict),
    browser: values.browser ?? null,
    help: Boolean(values.help),
  };
  if (opts.help) return opts;
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

// A URL as given, or a file path resolved against cwd as a file: URL.
export function toUrl(target, cwd = process.cwd()) {
  if (/^(?:https?|file):/i.test(target)) return target;
  const path = resolve(cwd, target);
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return pathToFileURL(path).href;
}

// PageResult: { target, url, error: string|null, loadingPlaceholders: number, result: audit result|null }
export function exitCode(pages, strict) {
  if (pages.some((p) => p.error)) return 2;
  const fails = (v) => strict || v.severity === 'error';
  return pages.some((p) => p.result && p.result.violations.some(fails)) ? 1 : 0;
}
