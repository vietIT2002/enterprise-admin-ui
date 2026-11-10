# Next.js config-aware guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skill's Next.js advice depend on `cacheComponents` and the installed version, backed by a re-runnable build fixture.

**Architecture:** A fixture app in `tests/next-build/` has its own pinned `package.json`. `tools/check-next-build.mjs` writes case routes into it, sets the flag, runs `next build`, and compares each result with an expectation matrix. The text changes in SKILL.md and `react-shadcn.md` state only what that matrix shows. A separate workflow runs the check on demand (pinned version) and weekly (`next@latest`).

**Tech Stack:** Node 24 ESM, no dependencies at the root. Fixture: next 16.4.6, React 19 and `.jsx` pages. GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-nextjs-config-aware-guidance-design.md`

## Global Constraints

- Next.js is never added to the root `package.json` dependencies or to `npm test`. The fixture has its own `package.json` and lockfile.
- Pin exact versions in the fixture: `next` 16.4.6, plus `react` and `react-dom` at one exact 19.x version that next 16.4.6 accepts.
- Pages are `.jsx`. There is no TypeScript in the fixture.
- With the flag on, `next.config.mjs` sets both `cacheComponents: true` and `partialPrefetching: true`. With it off, it sets neither.
- The SKILL.md change stays about the length of the current sentence, and it adds nothing to the always-loaded entrypoint beyond that.
- Commit messages and PR text carry no Claude or Claude Code attribution of any kind.
- If a build result differs from the spec's table, the result wins. Update the matrix, the text and the spec's table to match.

## Review Focus

1. **Stale output between builds.** A route left in `app/`, or a `.next/` left from the previous build, can make a build pass or fail for the wrong reason. Clear `app/` and `.next/` before every build (Task 1, Step 3), and check by running the script twice in a row (Task 1, Step 5).
2. **A build that fails for another reason** (a missing package, a syntax error) could count as an expected failure. A failing case passes only if the output matches its error pattern; Task 1 asserts this.
3. **Windows paths and process spawning.** `npm` is `npm.cmd`, and the temporary directory for `--next` may contain spaces. Run the check on this Windows machine (Task 1, Steps 4 and 5). Spawn `next` through `node node_modules/next/dist/bin/next`, never through `npx`.
4. **A build that hangs**, for example on telemetry or network access, must not hang the check. Set `NEXT_TELEMETRY_DISABLED=1` and give each build a 300 s limit; a timeout exits 2 (Task 1, Step 3).
5. **The generated fixture files get committed by accident.** `.gitignore` covers `tests/next-build/{node_modules,.next,app}` and `next.config.mjs`. Task 1, Step 6 checks `git status`.

---

### Task 1: Build fixture and check script

**Files:**
- Create: `tests/next-build/package.json`, `tests/next-build/package-lock.json` (from `npm install`)
- Create: `tests/next-build/cases/layout.jsx`, `await-page.jsx`, `loading.jsx`, `suspense-client.jsx`, `state-reader.jsx`, `suspense-async-child.jsx`, `bare-client.jsx`
- Create: `tools/check-next-build.mjs`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: `npm run check:next [-- --next <version>]`. Exit codes: 0 when every case matches, 1 on a mismatch, 2 on a setup error (install, timeout). It prints one line per case and mode.
- Produces: `CASES` in `tools/check-next-build.mjs`. Each is `{ id, route: { 'page.jsx': 'cases/<file>', ... }, results: { on: Expect, off: Expect } }`, where `Expect` is `{ pass: true }` or `{ pass: false, error: RegExp }`. Task 2 reads the final values from this matrix.

- [ ] **Step 1: Write the case sources.** Each case is a route under `app/<id>/`.
  - `layout.jsx`: the root layout, `<html lang="en"><body>{children}</body></html>`.
  - `await-page.jsx`: `export default async function Page({ searchParams }) { const { state } = await searchParams; … }`.
  - `loading.jsx`: returns `<p>Loading…</p>`.
  - `state-reader.jsx`: `'use client'`; reads `useSearchParams().get('state')`.
  - `suspense-client.jsx`: a sync page, `<Suspense fallback=…><StateReader /></Suspense>`.
  - `suspense-async-child.jsx`: a sync page passing the `searchParams` promise to an async child under `<Suspense>`.
  - `bare-client.jsx`: a sync page rendering `<StateReader />` with no Suspense.

- [ ] **Step 2: Write the expectation matrix (the test) in `tools/check-next-build.mjs`.** Values come from the spec's table.

  | id | route files | on | off |
  |---|---|---|---|
  | `await-page` | page = `await-page.jsx` | fail `/Uncached data was accessed outside of <Suspense>/` | pass |
  | `await-loading` | page = `await-page.jsx`, `loading.jsx` | pass | pass |
  | `suspense-client` | page = `suspense-client.jsx`, `state-reader.jsx` | pass | pass |
  | `suspense-async-child` | page = `suspense-async-child.jsx` | pass | pass |
  | `bare-client` | page = `bare-client.jsx`, `state-reader.jsx` | fail `/useSearchParams\(\) should be wrapped in a suspense boundary\|missing-suspense-with-csr-bailout/` | same |

- [ ] **Step 3: Implement `main(argv)` in `tools/check-next-build.mjs`.**
  - For each mode, build all the cases expected to pass that mode together, once. Build each expected failure on its own.
  - Before every build, remove `app/`, `.next/` and `next.config.mjs`. Then write `app/layout.jsx`, each case's route and the config.
  - Run `node node_modules/next/dist/bin/next build` in the fixture directory, with `NEXT_TELEMETRY_DISABLED=1` and a 300 s timeout. Capture stdout and stderr.
  - A group build that fails counts as a mismatch for every case in it, and the output names the failing route.
  - If `node_modules/next` is missing, run `npm ci` in the fixture first, with `shell: true` on win32.
  - With `--next <v>`, copy the fixture, without `node_modules`, to `mkdtemp(os.tmpdir())`. Run `npm install --no-audit --no-fund next@<v>` there, build there, and remove the copy afterwards.
  - Print `✓|✗ <id>  <on|off>  expected <pass|fail>  got <pass|fail>`. On a mismatch, also print the build output's last 30 lines.

- [ ] **Step 4: Run it, and record the real results.**
  Run: `npm ci --prefix tests/next-build && npm run check:next`
  Expected: every line is ✓ and the exit code is 0. On a ✗ for `bare-client`, set its row to the real result; the spec says to record it. On a ✗ for any other row, check the output first. If it is a genuine Next behaviour and not a fixture bug, update the row and write the difference down for Task 2.

- [ ] **Step 5: Run it again, unchanged.**
  Run: `npm run check:next`
  Expected: the same table and exit 0. This shows there is no stale state (Review Focus 1).

- [ ] **Step 6: Add `"check:next": "node tools/check-next-build.mjs"` to the root scripts, and add the `.gitignore` lines from Review Focus 5.**
  Run: `git status --short`
  Expected: no `tests/next-build/node_modules`, `.next`, `app` or `next.config.mjs` in the list.

- [ ] **Step 7: Commit.**
  `git add tests/next-build tools/check-next-build.mjs package.json .gitignore`
  `git commit -m "test(next-build): fixture and check:next for the Next.js build rules the skill states"`

### Task 2: Config-aware text in SKILL.md and react-shadcn.md

**Files:**
- Modify: `skills/enterprise-admin-ui/SKILL.md:143`
- Modify: `skills/enterprise-admin-ui/references/react-shadcn.md:25` (the "Next.js App Router" bullet)
- Modify: `CHANGELOG.md` (Unreleased → Fixed)
- Modify: `skills/enterprise-admin-ui/references/filters-search.md:171`, only if the `bare-client` result contradicts "Wrap the page in `<Suspense>` because `useSearchParams` needs it"
- Modify: `docs/superpowers/specs/2026-11-10-nextjs-config-aware-guidance-design.md` (case table), only if Task 1 changed a row
- Regenerate: `adapters/`, with `npm run build:adapters`

**Interfaces:**
- Consumes: the final `CASES` matrix from Task 1. Every claim in the text must match a row.

- [ ] **Step 1: Rewrite SKILL.md line 143's Next.js sentence.** It must say:
  - check `cacheComponents` in `next.config`;
  - with it on, a page that awaits `searchParams` needs `<Suspense>` above it (`loading.tsx` counts), or `next build` fails;
  - reading `?state=` in a client component under `<Suspense>` (react-shadcn.md) works either way;
  - keep a server page that already builds.

  It must not say that awaiting `searchParams` always fails.

- [ ] **Step 2: Rewrite the react-shadcn.md "Next.js App Router" bullet.** Cover, in order:
  - read the installed `next` version and `next.config.*`. On Next 16, Cache Components is on only with `cacheComponents: true`, which `create-next-app` sets from 16.4. Next 17 plans to turn it on everywhere.
  - the failure: with it on, `params`, `searchParams`, `cookies()` or `headers()` awaited with no `<Suspense>` above fails `next build`. With it off, the page becomes dynamic and builds.
  - the fixes, each backed by a ✓ row:
    - a client component reading `useSearchParams()` or `useParams()` under `<Suspense>`;
    - an async child awaiting the promise under `<Suspense>`;
    - `loading.tsx`;
    - `generateStaticParams` for `params`. This one is from the docs and not in the fixture, so cite the docs link.
  - the `bare-client` result, as it turned out;
  - keep working server/client boundaries;
  - "`tsc` and `eslint` pass either way, so run `next build`";
  - a source line: "Checked 2026-11 against next 16.4.6:", followed by the two docs URLs from the spec.

- [ ] **Step 3: Add one CHANGELOG entry under Unreleased → Fixed.** It should name the old claim, the new condition, and `npm run check:next`.

- [ ] **Step 4: Verify.**
  Run: `npm run build:adapters && npm run check:adapters && npm test && npm run check:next`
  Expected: "adapters/ matches SKILL.md"; `npm test` has 0 fail (3 skipped, the POSIX-only tests); `check:next` exits 0.
  Run: `grep -n "fails \`next build\`" skills/enterprise-admin-ui/SKILL.md`
  Expected: no line that states the failure without its condition.

- [ ] **Step 5: Commit.**
  `git add skills CHANGELOG.md adapters docs/superpowers`
  `git commit -m "fix(skill): Next.js build advice depends on cacheComponents, not on the version alone"`

### Task 3: next-build workflow

**Files:**
- Create: `.github/workflows/next-build.yml`

**Interfaces:**
- Consumes: `npm run check:next [-- --next <version>]` from Task 1.

- [ ] **Step 1: Write the workflow.**
  - Triggers: `workflow_dispatch`, with an optional input `next` (default empty, which means the pinned version), and `schedule: cron '0 3 * * 1'`.
  - One job on `ubuntu-latest`, with the same `actions/checkout` and `actions/setup-node` versions and Node version as `ci.yml`.
  - Steps: `npm ci --prefix tests/next-build`, then `npm run check:next`. When the run is scheduled, append `-- --next latest`; when the dispatch input is set, append `-- --next ${{ inputs.next }}`.
  - `permissions: contents: read`.

- [ ] **Step 2: Verify that it parses, and that it matches ci.yml.**
  Run: `python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/next-build.yml`.
  Expected: no error. If PyYAML is not installed, say so in the report and compare the file with `ci.yml` by eye. Either way, the action versions and Node version must match `ci.yml`.

- [ ] **Step 3: Commit.**
  `git add .github/workflows/next-build.yml`
  `git commit -m "ci: next-build workflow, on demand and weekly against next@latest"`
