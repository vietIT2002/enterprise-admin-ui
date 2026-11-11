# R4 Check Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `audit-cli --checks` result a status, a required flag and stated evidence; let users declare required and not-applicable checks; never count an absent control as a pass.

**Architecture:**
- The judge functions keep detecting problems, and they now also return evidence.
- A pure `withRequirement` step maps each judged result to a status, using what the user declared.
- `behaviourChecks` skips the checks declared not applicable.
- `exitCode` and `formatText` read `status`.
- `audit.js` is not touched.

**Tech Stack:** Node 24 ESM, no dependencies, `node:test`. End-to-end tests drive the CLI against the existing local test server.

**Spec:** `docs/superpowers/specs/2026-11-11-r4-check-status-design.md`

## Global Constraints

- `skills/enterprise-admin-ui/scripts/audit.js` is unchanged.
- JSON stays additive. Existing CheckResult fields (`check`, `ok`, `skipped`, `unverified`, `blocked`, `problems`, `note`, `error`) keep their meaning.
- New fields: `status`, `required` and `evidence: { method, basis, observed, limitation }`.
- Status values: `pass`, `fail`, `not_applicable`, `not_verified`, `error`.
- Evidence values:
  - `method` is one of `interaction`, `dom`, `print-media`, `manual`.
  - `basis` is one of `direct`, `heuristic`, `manual`.
- Check names are exactly those in `CHECKS`: `search`, `export`, `print`, `confirm`, `live-region`.
- Exit codes:
  - 2 for a usage error or for a page, state or check that could not run.
  - 1 for an audit ✗ (or any violation with `--strict`), a failed state, a check with status `fail`, or a required check that is `not_verified`.
  - 0 otherwise.
- SKILL.md grows by at most 40 words.
- Commit messages and PR text carry no Claude or Claude Code attribution of any kind.

## Review Focus

1. **A declared not-applicable check must not run.** In particular, `--not-applicable confirm` must not click Delete, even with `--disposable`. Task 2's end-to-end test checks this against the R1 `/checks-api-now` page and the server's `mutations` list.
2. **A required check that is absent on one page and present on another,** across a multi-page run. Requirements apply to every page given. Task 2 covers this with a two-URL run.
3. **Confusing "required and absent" (fail) with "required and not clicked" (not_verified).** Task 1's unit tests cover both, and Task 2's end-to-end tests cover both exit codes.
4. **Existing tests that asserted "skipped is ok".** They must still pass, or be updated with a reason. Unrelated test semantics must not change silently. Task 1 Step 4 and Task 2 Step 5 run the full suite.
5. **Terminal output that hides the reason for exit 1.** When a required check is unresolved, the "Required but not shown to pass" line names it and says how to fix it. Task 1's `formatText` test asserts this.

---

### Task 1: Status model, evidence, exit code and text (pure functions)

**Files:**
- Modify: `skills/enterprise-admin-ui/scripts/audit-cli.mjs`: the `outcome`, `judgeSearch`, `judgeExport`, `judgePrint`, `judgeConfirm`, `judgeLive` and `exitCode` functions, and `checkLine` / `formatText`.
- Test: `tests/audit-cli-unit.test.mjs`

**Interfaces:**
- Produces: `export function withRequirement(result: CheckResult, { required = false } = {}): CheckResult`. It returns a copy with `required` and `status` set:
  - `error` → `error`;
  - any `problems` → `fail`;
  - `skipped && !unverified`: if required → `fail`, with a problem `"required <check>: no matching control found"`; otherwise → `not_verified`;
  - `unverified` → `not_verified`;
  - anything else → `pass`.
- Produces: `export function notApplicable(check: string): CheckResult`. Its `status` is `'not_applicable'`, `ok` is true, `skipped` is true, `required` is false, and `evidence` is `{ method: 'manual', basis: 'manual', observed: 'declared not applicable with --not-applicable', limitation: null }`.
- Produces: each `judge*` result carries `evidence`, following the spec's evidence table. An absent control uses method `dom`, basis `heuristic`, observed "no <control> matched the name patterns", and limitation "the control may exist under another name".
- Produces: `exitCode(pages, strict)` also returns 1 when any check has `required && status === 'not_verified'`.
- Produces: `formatText` writes:
  - `(required)` after the check name of each required check;
  - a summary line `Checks: N pass · N fail · N not verified · N not applicable`, listing only the counts above zero, plus `· N error` when some exist;
  - and, when there are unresolved requirements, `Required but not shown to pass: <check> (<reason>), …`.

- [ ] **Step 1: Write the failing unit tests.**
  - `withRequirement` for every row of the spec's status table:
    - `judgeExport([])` undeclared → `not_verified`, required → `fail` with a "required export" problem;
    - `judgeConfirm({ label: 'Delete', clicked: false })` required → `not_verified`;
    - a passing `judgeLive(1)` → `pass`;
    - a failing `judgeLive(0)` → `fail`;
    - a result with `error` → `error`.
  - `notApplicable('print')` has the exact shape above.
  - Every `judge*` output has `evidence.method`, `evidence.basis`, `evidence.observed` and `evidence.limitation` (export's limitation mentions that the export was not run).
  - `exitCode`: a required `not_verified` gives 1, an optional `not_verified` gives 0, and `not_applicable` gives 0.
  - `formatText`: the summary line and the "Required but not shown to pass: confirm (run with --disposable)" line appear; ✓ ✗ ? – are kept.

- [ ] **Step 2: Run them, and confirm they fail.**
  Run: `node --test tests/audit-cli-unit.test.mjs`
  Expected: the new tests FAIL, because `withRequirement` and `notApplicable` are not exported and `evidence` is undefined.

- [ ] **Step 3: Implement the interfaces above in `audit-cli.mjs`.** Keep `outcome()` as the one constructor, and add `evidence` to it.

- [ ] **Step 4: Run the unit tests, then the full suite.**
  Run: `node --test tests/audit-cli-unit.test.mjs`, then `npm test`.
  Expected: the unit tests pass, and `npm test` shows 0 fail (3 skipped). Update an existing assertion only if it asserted the old meaning, and say which and why in the report.

- [ ] **Step 5: Commit.**
  `git commit -m "feat(audit-cli): check status, required flag and evidence on every behaviour check"`

### Task 2: Flags, wiring, states and end-to-end tests

**Files:**
- Modify: `skills/enterprise-admin-ui/scripts/audit-cli.mjs`: `parseCli`, `behaviourChecks`, `auditTargets`, `auditState` and the state-failure path, `main`, `HELP` and the header comment.
- Test: `tests/audit-cli-unit.test.mjs` and `tests/audit-cli.test.mjs`

**Interfaces:**
- Consumes: `withRequirement` and `notApplicable` from Task 1.
- Produces: `parseCli` returns `require: string[]` and `notApplicable: string[]`, both empty by default. These are `UsageError`s:
  - an unknown name: list the valid names;
  - a name in both lists;
  - either flag without `--checks`.
- Produces: `auditTargets(targets, { …, require = [], notApplicable = [] })`.
- Produces: `behaviourChecks` returns `notApplicable(check)` for a declared check without running it, and wraps every other result in `withRequirement(result, { required: require.includes(check) })`.
- Produces: each state result gets `status`: `pass` when `ok`, `fail` when there are problems, `error` when there is an error.

- [ ] **Step 1: Write the failing tests.**
  - **Unit, `parseCli`:**
    - `['a', '--checks', '--require', 'export,confirm', '--not-applicable', 'print']` → `require: ['export', 'confirm']`, `notApplicable: ['print']`;
    - the three error cases;
    - update the existing full-shape `deepEqual` tests to include `require: []` and `notApplicable: []`.
  - **End to end** (`checksOf` already passes `--disposable` by default):
    - `/checks-settings --require export` → export `status: 'fail'`, `required: true`, exit 1, and the stdout has "Required but not shown to pass: export".
    - `/checks-settings --not-applicable export` → `not_applicable`, exit 0.
    - `/checks-settings` with nothing declared → export `not_verified`, exit 0.
    - `/checks --require confirm` without `--disposable` → confirm `not_verified`, exit 1.
    - `/checks --require confirm --disposable` → `pass`.
    - `/checks-api-now --not-applicable confirm --disposable` → confirm `not_applicable`, and the server's `mutations` is `[]` (Review Focus 1).
    - Two URLs, `/checks` and `/checks-settings`, with `--require search` → `pass` on the first, `fail` on the second, exit 1 (Review Focus 2).
    - `--states` on `/stateful` → each state has `status: 'pass'`.

- [ ] **Step 2: Run them, and confirm they fail.**
  Run: `node --test --test-name-pattern="require|not-applicable|status" tests/audit-cli-unit.test.mjs tests/audit-cli.test.mjs`
  Expected: FAIL. The unknown options give exit 2, and `status` is undefined.

- [ ] **Step 3: Implement the wiring.** `main` passes `opts.require` and `opts.notApplicable` through.
  - Update `HELP` and the header comment: the two flags, the statuses and the exit codes.
  - The `--checks` help line no longer says "A check the page gives no control for is skipped". It now says such a check is not verified unless declared.

- [ ] **Step 4: Run the focused tests.**
  Expected: PASS.

- [ ] **Step 5: Run the full suite.**
  Run: `npm test`
  Expected: 0 fail (3 skipped). Run `git diff main -- skills/enterprise-admin-ui/scripts/audit.js` and expect empty output.

- [ ] **Step 6: Commit.**
  `git commit -m "feat(audit-cli): --require and --not-applicable; an absent control is never a pass"`

### Task 3: Docs

**Files:**
- Modify: `skills/enterprise-admin-ui/SKILL.md`, Verify (around line 214)
- Modify: `CHANGELOG.md`, Unreleased → Added
- Regenerate: `adapters/`

- [ ] **Step 1: Edit SKILL.md Verify.** Replace "and a check the page has no control for is skipped" with the new meaning:
  - pass `--require` for what the task asks the screen to do, and `--not-applicable` for what it rules out;
  - `?` means not verified.
  Measure with `wc -w` before and after: at most +40 words.

- [ ] **Step 2: Add the CHANGELOG entry.**
  - Name the flags, the statuses and the evidence fields.
  - State that the exit code is 1 for a required check that is `not_verified`.
  - State that the JSON is additive and the audit score is unchanged.

- [ ] **Step 3: Verify.**
  Run: `npm run build:adapters && npm run check:adapters && npm test`
  Expected: "adapters/ matches SKILL.md" and 0 fail.
  Run: `node skills/enterprise-admin-ui/scripts/audit-cli.mjs skills/enterprise-admin-ui/assets/templates/list.html --type list --checks --disposable`
  Expected: exit 0, and the summary line is printed. The template keeps passing, per the CHANGELOG claim "each passes `--checks`".

- [ ] **Step 4: Commit.**
  `git commit -m "docs: --require / --not-applicable and check status in SKILL.md Verify and the CHANGELOG"`
