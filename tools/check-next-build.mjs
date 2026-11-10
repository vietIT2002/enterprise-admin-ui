#!/usr/bin/env node
// Builds the Next.js fixture in tests/next-build with `cacheComponents` on and off, and checks each case route
// against the expectations in CASES. The skill's Next.js build advice rests on these results.
//
//   npm run check:next                  build against the pinned next version
//   npm run check:next -- --next 17.0.0 build against another version, in a temporary copy
//
// Exit codes: 0 every case matches, 1 a mismatch, 2 a setup error (install, timeout).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'next-build');
const PASS = { pass: true };
// next 16.4 words this as "`useSearchParams()` in a Client Component outside of `<Suspense>`"; older versions as "should be wrapped".
const SUSPENSE_CSR =
  /useSearchParams\(\)` in a Client Component outside of|blocking-prerender-client-hook|useSearchParams\(\) should be wrapped in a suspense boundary|missing-suspense-with-csr-bailout/;

// route maps a file in the route folder to its source in cases/. results holds the expected outcome per mode.
export const CASES = [
  {
    id: 'await-page',
    route: { 'page.jsx': 'cases/await-page.jsx' },
    results: { on: { pass: false, error: /Next\.js encountered uncached or runtime data during prerendering|blocking-prerender-dynamic/ }, off: PASS },
  },
  {
    id: 'await-loading',
    route: { 'page.jsx': 'cases/await-page.jsx', 'loading.jsx': 'cases/loading.jsx' },
    results: { on: PASS, off: PASS },
  },
  {
    id: 'suspense-client',
    route: { 'page.jsx': 'cases/suspense-client.jsx', 'state-reader.jsx': 'cases/state-reader.jsx' },
    results: { on: PASS, off: PASS },
  },
  {
    id: 'suspense-async-child',
    route: { 'page.jsx': 'cases/suspense-async-child.jsx' },
    results: { on: PASS, off: PASS },
  },
  {
    id: 'bare-client',
    route: { 'page.jsx': 'cases/bare-client.jsx', 'state-reader.jsx': 'cases/state-reader.jsx' },
    results: { on: { pass: false, error: SUSPENSE_CSR }, off: { pass: false, error: SUSPENSE_CSR } },
  },
];

class SetupError extends Error {}

const npm = (args, cwd) => {
  const r = spawnSync('npm', args, { cwd, shell: true, stdio: 'inherit' });
  if (r.status !== 0) throw new SetupError(`npm ${args.join(' ')} failed`);
};

const configFor = (mode) =>
  mode === 'on'
    ? 'export default { cacheComponents: true, partialPrefetching: true };\n'
    : 'export default {};\n';

// Writes the routes and config into dir, runs next build, and returns { pass, output }.
function build(dir, mode, cases) {
  for (const p of ['app', '.next', 'next.config.mjs']) rmSync(join(dir, p), { recursive: true, force: true });
  mkdirSync(join(dir, 'app'));
  copyFileSync(join(dir, 'cases/layout.jsx'), join(dir, 'app/layout.jsx'));
  for (const c of cases) {
    mkdirSync(join(dir, 'app', c.id));
    for (const [name, src] of Object.entries(c.route)) copyFileSync(join(dir, src), join(dir, 'app', c.id, name));
  }
  writeFileSync(join(dir, 'next.config.mjs'), configFor(mode));
  const r = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: dir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new SetupError(`next build (${mode}) did not finish: ${r.error.message}`);
  return { pass: r.status === 0, output: `${r.stdout}\n${r.stderr}` };
}

const tail = (text, n = 30) => text.trimEnd().split('\n').slice(-n).join('\n');

function run(dir) {
  const rows = [];
  for (const mode of ['on', 'off']) {
    const passing = CASES.filter((c) => c.results[mode].pass);
    const groups = [
      ...(passing.length ? [passing] : []),
      ...CASES.filter((c) => !c.results[mode].pass).map((c) => [c]),
    ];
    for (const group of groups) {
      const { pass, output } = build(dir, mode, group);
      for (const c of group) {
        const want = c.results[mode];
        // A passing group build proves every route in it built. A failing one fails each case in it.
        const ok = want.pass ? pass : !pass && want.error.test(output);
        rows.push({ id: c.id, mode, want, got: pass ? 'pass' : 'fail', ok, output, group });
      }
    }
  }
  return rows;
}

export function main(argv) {
  const at = argv.indexOf('--next');
  const version = at >= 0 ? argv[at + 1] : null;
  if (at >= 0 && !version) throw new SetupError('--next needs a version');
  let dir = FIXTURE;
  let temp = null;
  try {
    if (version) {
      temp = mkdtempSync(join(tmpdir(), 'next-build-'));
      cpSync(FIXTURE, temp, { recursive: true, filter: (s) => !/[\/](node_modules|\.next|app)$/.test(s) });
      dir = temp;
      npm(['install', '--no-audit', '--no-fund', `next@${version}`], dir);
    } else if (!existsSync(join(dir, 'node_modules/next'))) {
      npm(['ci', '--no-audit', '--no-fund'], dir);
    }
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules/next/package.json'), 'utf8')).version;
    console.log(`next ${installed} (cacheComponents on/off matrix)`);
    const rows = run(dir);
    for (const r of rows) {
      const want = r.want.pass ? 'pass' : 'fail';
      console.log(`${r.ok ? '✓' : '✗'} ${r.id.padEnd(22)}${r.mode.padEnd(4)}expected ${want}  got ${r.got}`);
      if (!r.ok) {
        console.log(`  build of: ${r.group.map((c) => `/${c.id}`).join(' ')}`);
        console.log(tail(r.output).replace(/^/gm, '  '));
      }
    }
    return rows.every((r) => r.ok) ? 0 : 1;
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    console.error(e.message);
    return 2;
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
