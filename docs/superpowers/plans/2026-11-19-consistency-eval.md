# Consistency Eval (part 1: baseline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure how the released skill handles an AI-made, inconsistent, multi-page admin app. The measures are cross-page consistency, how much the app changes, and whether its functions survive. Then record a baseline report.

**Architecture:**
- **The fixture** is five self-contained, deterministic HTML pages. Each pattern is deliberately implemented differently from page to page, and the pages carry template tells.
- **`grade.mjs`** is Playwright-based. It extracts a signature for each pattern on each page and scores consistency. It also runs `audit-cli` for the score and the audit's tell rules, adds three tell detectors of its own, computes a first-screen pixel difference through canvas, and checks that each page still works.
- **The agent runs and the report** are controller steps, as in R3.

**Tech Stack:** Node 24 ESM, Playwright 1.64.1 (already a devDependency), `audit-cli.mjs --json` and `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-19-consistency-eval-design.md`. Read its "Decisions after the builder check" section, which is binding.

## Global Constraints

- No new dependencies.
- **The fixture** uses inline CSS and JS only. It makes no network request, and has no `Date.now`, randomness, animation or relative dates. Its data is fixed, with Vietnamese names and `vi-VN` dates.
- **Pages and audit types:**
  - `employees.html`, `timesheets.html` and `leave-requests.html` are `list`;
  - `reports.html` is `report`;
  - `settings.html` is `settings`.
- **Row counts:** employees 48, timesheets 120, leave requests 36, reports 12.
- **Patterns**, with their signature keys: `pagination`, `filterBar`, `pageHeader`, `statusBadge`, `dateFormat`, `tableRow`.
- **Counted tells:**
  - the audit rules `no-gradient`, `no-backdrop-blur`, `surface-shadow`, `uppercase-text` and `emoji-icon`;
  - `table-above-fold` on list pages;
  - the grader detectors `greeting-header`, `rainbow-status` (5 or more distinct badge hues on one page) and `initials-avatar-non-person`.
- **Pixel difference:** on the 1440×900 first screen only. A pixel counts as changed when its RGB Euclidean distance is above 32, and the result is the percentage of changed pixels.
- `skills/enterprise-admin-ui/scripts/audit.js` and `skills/enterprise-admin-ui/SKILL.md` are unchanged. This plan changes nothing under `skills/`.
- Commit messages and PR text carry no Claude or Claude Code attribution of any kind.
- Never overlap browser test runs on this machine. Run `npm test` alone.

## Review Focus

1. **A signature heuristic that reports "consistent" for different patterns, or "inconsistent" for equivalent markup.** Task 2's tests assert the fixture's planned inconsistencies. They also assert that two hand-made equivalent variants produce the same signature: icon-only Prev/Next with an accessible name against text Prev/Next, and chips made of buttons against chips made with `role="tab"`.
2. **A grader that cannot see an improvement.** Task 3's test fixes two pages by hand in a temporary copy: shared pagination, no gradient. It expects higher consistency, fewer tells and a pixel difference above 0. The fixture compared with itself must give 0% and the same counts.
3. **A function-kept check that passes a broken page.** Task 2's tests use a copy with the rows removed, a copy with the search box removed, and a copy with the file missing. They expect "no data rows", "pattern lost: search" and "page missing".
4. **Nondeterminism.** Grading the fixture twice must give identical JSON, apart from timestamps (Task 3).
5. **A grader crash on an agent's unusual output.** For example, a page that fails to load, or a page without a table. The grader reports these per page and never throws. Task 3 tests a page that throws a script error on load.

---

### Task 1: Fixture app

**Files:**
- Create: the five pages in `tests/agent-eval/consistency/fixture/`, and `tests/agent-eval/consistency/FIXTURE.md`
- Test: `tests/consistency-eval.test.mjs` (fixture part)

**Interfaces:**
- Produces the pages.
- Produces `FIXTURE.md`. For each page it lists:
  - the variant of each pattern on that page, for example pagination: `load-more`;
  - the tells it carries;
  - the known name the search should find, for example "Nguyễn Văn An".
- Produces one shared navigation sidebar, copied into every page with links to the other four. It is part of the AI look (`navy-sidebar-indigo-accent`).

- [ ] **Step 1: Write the failing tests.** For each page, load it with Playwright from `file://` and assert:
  - no console error and no network request outside `file:`;
  - the row count matches its constant above (only `settings` has no table);
  - the search box, where present, narrows the rows when the known name is typed;
  - each pattern's variant is the one `FIXTURE.md` lists (assert on the DOM directly here, not through the grader);
  - `settings` has at least 3 labelled fields.
- [ ] **Step 2: Run the tests.**
  Run: `node --test tests/consistency-eval.test.mjs`
  Expected: FAIL, because the pages do not exist.
- [ ] **Step 3: Build the pages.**
  - Every pattern has a different variant on every page that uses it, as listed in the spec's table.
  - Every counted tell appears on at least 2 pages, and every page carries at least 3 tells.
- [ ] **Step 4: Run the tests.**
  Run: `node --test tests/consistency-eval.test.mjs`
  Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "test(eval): AI-made attendance admin fixture with deliberate cross-page inconsistencies and template tells"`

### Task 2: Grader — signatures, consistency, function kept

**Files:**
- Create: `tests/agent-eval/consistency/grade.mjs`
- Test: `tests/consistency-eval.test.mjs` (grader part)

**Interfaces:**
- Consumes: the fixture and `FIXTURE.md` from Task 1.
- Produces:
  - `export const PAGES = { 'employees.html': 'list', 'timesheets.html': 'list', 'leave-requests.html': 'list', 'reports.html': 'report', 'settings.html': 'settings' }`
  - `export const KNOWN_NAME = { … }`, the search term for each page that has one.
  - `export async function signatures(page) → { pagination, filterBar, pageHeader, statusBadge, dateFormat, tableRow }`. A key is `null` when the pattern is absent. Each value is a JSON-serialisable, normalised object, following the spec's signature table.
  - `export function consistency(byPage: Record<string, Signatures>) → { score: { consistent: number, of: number }, patterns: Record<name, { consistent: boolean, present: string[], byPage: Record<string, object> }> }`. A pattern counts when it is present on 2 or more pages. `statusBadge` compares only the statuses that two pages share.
  - `export async function functionKept(page, file, before: { hadSearch: boolean, hadPagination: boolean }) → { ok: boolean, problems: string[] }`.

- [ ] **Step 1: Write the failing tests.**
  - On the fixture, `consistency` → `score.consistent === 0` and `score.of === 6`. Every pattern is listed with the variant per page that `FIXTURE.md` gives.
  - The equivalence tests in Review Focus 1 give equal signatures.
  - The function-kept negative tests in Review Focus 3 produce those problems.
  - Run on the fixture, `functionKept` passes every page.
- [ ] **Step 2: Run the tests.**
  Run: `node --test tests/consistency-eval.test.mjs`
  Expected: FAIL, because `grade.mjs` does not exist.
- [ ] **Step 3: Implement the functions.** The detection of a search box, of the pagination controls and of the filter controls follows the spec's "Decisions" item 1, which lists the equivalent markups to accept.
- [ ] **Step 4: Run the tests.**
  Run: `node --test tests/consistency-eval.test.mjs`
  Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "test(eval): grader signatures, cross-page consistency and function-kept checks"`

### Task 3: Grader — change metrics, CLI and report JSON

**Files:**
- Modify: `tests/agent-eval/consistency/grade.mjs`
- Test: `tests/consistency-eval.test.mjs`

**Interfaces:**
- Consumes: the functions from Task 2.
- Produces: `export async function grade(beforeDir, afterDir, { outDir }) → Report`. It writes `report.json`, plus screenshots at `screens/<before|after>/<page>.png` (first screen) and `screens/<…>/<page>.full.png`. It never throws on a bad page; it records the error for that page.
- The `Report` shape:
  - `consistency`: `{ before, after }` from `consistency()`;
  - `pages[file]`: `{ type, audit: { before: { score, errors, warnings }, after: {…} }, tells: { before: string[], after: string[] }, pixelDiffPct, functionKept: { ok, problems } }`;
  - `summary`: the totals.
- Produces a CLI: `node tests/agent-eval/consistency/grade.mjs <before> <after> [--out <dir>]`. It prints a summary table.

- [ ] **Step 1: Write the failing tests.**
  - The fixture compared with itself: `pixelDiffPct === 0` for every page, the same audit scores and tells before and after, and consistency 0 of 6 on both sides.
  - Grading twice gives identical JSON, ignoring timestamps.
  - A temporary copy where two pages share one pagination and drop the gradient: consistency for `pagination` rises (the copy's two pages agree), the gradient tell disappears on those pages, and `pixelDiffPct` is above 0 on them.
  - A copy where one page throws on load: that page's `functionKept.ok` is false with the error, and `grade` resolves.
- [ ] **Step 2: Run the tests.**
  Expected: FAIL, because `grade` does not exist.
- [ ] **Step 3: Implement.**
  - The audit runs through `audit-cli.mjs --json --type <PAGES[file]>` as a child process, with `file://` targets.
  - The tells come from the audit result's violations, plus the three detectors.
  - The pixel difference takes two first-screen PNG data URLs, draws them to canvas in a blank page, and compares pixels with the threshold.
- [ ] **Step 4: Run the tests.**
  Run: `node --test tests/consistency-eval.test.mjs`, twice. Then `npm test`, alone.
  Expected: PASS both times, and 0 fail overall.
- [ ] **Step 5: Commit.**
  `git commit -m "test(eval): grader change metrics (audit, tells, first-screen pixel diff), CLI and report JSON"`

### Controller step A: Baseline runs (not an implementer task)

1. Prepare the skill: `git archive bc0a566 skills/enterprise-admin-ui`, extracted to `<scratch>/c/k1/`.
2. Prepare the runs: for each run, copy the fixture to its own parent folder with a neutral name, `<scratch>/c/rNN/app/`.
3. **Prompts** are the R3 run template, with these tasks:
   - **P1:** "Apply the enterprise-admin-ui skill to this app." This applies to the skill runs. For the no-skill runs the template drops the skill sentence, and the task becomes "Improve this app's UI."
   - **P2:** "Redesign this attendance admin so it looks professional and consistent."
4. **The matrix** is 6 runs on sonnet. With the released skill, P1 ×2 and P2 ×2. Without the skill, P1 ×1 and P2 ×1.
5. Grade each run with `grade.mjs <fixture> <run>/app --out <scratch>/c/rNN/grade`. Record the summary in the report.

### Task 4: Baseline report and screenshot page (controller-written, reviewed)

**Files:**
- Create: `docs/superpowers/evals/2026-11-19-consistency-baseline.md`
- Publish: an Artifact page with first-screen screenshots of the fixture and of one run per prompt and condition, side by side for each page.

- [ ] **Step 1: Write the report.** It covers:
  - the matrix table: consistency before and after, audit score change, tell change, median pixel difference and function kept, for each run;
  - the inconsistencies that remained after, per pattern;
  - the tells that remained;
  - what was weak, in order. This is the input to part 2;
  - the caveats.
- [ ] **Step 2: Publish the Artifact page.** Scale the images down and compress them as JPEG data URLs, staying under 16 MB.
- [ ] **Step 3: Commit the report.**
  `git commit -m "docs(eval): consistency and redesign baseline for the released skill"`
