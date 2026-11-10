# R3 Requirements vs Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate required rules from defaults in the skill, so agents keep an existing app's conventions and add no unsupported capabilities, and prove it with a small A/B against the released skill.

**Architecture:** There are two implementer tasks around two controller-run evaluation rounds.
- Task 1 builds four tiny fixture projects and a re-runnable `scenarios.md`.
- The controller then runs the baseline: the old skill from `main`, with agents in temp directories outside the repo.
- Task 2 changes the skill text.
- The controller runs the candidate, and Task 3 writes the A/B report.

**Tech Stack:** Markdown skill text, plain HTML and JS fixtures (Tailwind Play CDN, like `assets/templates/`), `audit-cli.mjs` for grading S4, and subagents (sonnet) as the agents under test.

**Spec:** `docs/superpowers/specs/2026-11-10-r3-requirements-vs-defaults-design.md`

## Global Constraints

- `SKILL.md` grows by at most about 150 words net. It is 3,410 words before this change; measure with `wc -w`.
- Do not change any audit rule. `table-row-height` stays as it is (that is R4).
- Each fixture is one page, plus `DESIGN.md` and/or `api.js`, and has only the properties in the spec's scenario table.
- Each eval run uses the same prompt template and model (sonnet). It runs in a fresh temp copy of its fixture outside the repo, with the skill copied to a temp directory outside the repo. Both the old and the new skill are copied that way, so neither agent can read the spec, the plan or the roadmap.
- Run the baseline before Task 2. If the old skill passes S1–S3, stop and report to the user before changing the text.
- Ship rule: the new skill passes S1–S3, and S4 is no worse than the old (score within 5 points; no new `table-row-two-line` or `table-row-height` ✗; `--states` and confirm pass if they passed for the old). Revise the text at most twice, then report.
- Commit messages and PR text carry no Claude or Claude Code attribution of any kind.

## Review Focus

1. **A fixture with an unplanned defect** makes S3 ambiguous, because a correct "defect" finding would then be about something else. Task 1 Step 3 checks that `customers.html` has exactly one real defect: the audit and a read-through find nothing else that breaks a required rule.
2. **Contamination.** An agent that can see the repo, the spec or the roadmap would know what is being tested. Both skill versions and every fixture are copied outside the repo, and the prompt names only those paths (controller steps A and B).
3. **A fixture that fails to load** (for example the Tailwind CDN is unreachable) makes the S1 or S3 results meaningless. Task 1 Step 3 runs `audit-cli` on each fixture page and expects no "Could not audit".
4. **A regression on new screens** that the S1–S3 wins could hide. S4 runs twice per version, and the report shows the numbers for both runs, not only an average.
5. **Grading by reading** (S3) can drift. `scenarios.md` fixes the grading questions in advance, and the report quotes the agent's lines that support each verdict.

---

### Task 1: Eval fixtures and scenarios

**Files:**
- Create: `tests/agent-eval/r3/scenarios.md`
- Create: `tests/agent-eval/r3/s1-existing-layout/orders.html` and `DESIGN.md`
- Create: `tests/agent-eval/r3/s2-no-draft/api.js` and `DESIGN.md`
- Create: `tests/agent-eval/r3/s3-review/customers.html` and `DESIGN.md`
- Create: `tests/agent-eval/r3/s4-new-screen/.gitkeep`

**Interfaces:**
- Produces: `scenarios.md`, with one section per scenario. Each section has:
  - `Prompt:` (verbatim task text);
  - `Pass when:` (numbered criteria from the spec table);
  - `Grade:` (the exact commands or questions).
- It also has a `Run prompt template` section. The controller uses it verbatim, with three placeholders: `{PROJECT_DIR}`, `{SKILL_DIR}` and `{TASK}`.

- [ ] **Step 1: Write the fixtures.**
  - **S1 `orders.html`:** an orders list. Its rows are `h-[52px]`, and its Customer cell has two lines (the name, with the email below in `text-slate-500`). There is a search box but no Status filter. Statuses are present in the data. `DESIGN.md` records "Rows: 52px; Customer cell shows name with email below; keep."
  - **S2 `api.js`:** exports only `createOrder(data)` and `updateOrder(id, data)`, both returning Promises. There is no draft concept anywhere. `DESIGN.md` records the product, roles and locale.
  - **S3 `customers.html`:**
    - The planted defect: the edit form's failed save (a simulated rejected request) clears every field.
    - The two divergences: the form uses `md:grid-cols-2` for related short fields (City · Postal code, Phone · Email), in task order, and it reflows to one column below `md`; and the rows are 52px, as `DESIGN.md` records.
    - Nothing else may break a required rule: states, confirmation, labels, announcements, focus to the first invalid field.
  - **S4:** an empty folder.

- [ ] **Step 2: Write `scenarios.md`.**
  - The run prompt template: "You are working in the project at {PROJECT_DIR}. An Agent Skill for this kind of work is installed at {SKILL_DIR}: read {SKILL_DIR}/SKILL.md first and follow it, opening its references as it directs. Task: {TASK} Work only inside {PROJECT_DIR}. When you finish, reply with what you changed, or with your findings if the task is a review."
  - Per scenario: the prompt from the spec table, the pass criteria, and the grading. The S4 prompt names the output file: "…single HTML file `orders.html` with mock data."
  - Grading:
    - **S1:** `git diff --no-index` of the original and the run's `orders.html`. Check that `h-[52px]` and the two-line cell are unchanged, that a Status filter exists, and that no file other than `orders.html` changed. Use `--no-index`, since the copies are not in a repo.
    - **S2:** `grep -niE "save draft|draft"` over the run's output files, and check the reply mentions.
    - **S3:** a fixture checksum before and after (it must be unchanged). The reply must name the lost-input bug as a defect, and must not call the two-column form or the 52px rows a defect.
    - **S4:** `node <repo>/skills/enterprise-admin-ui/scripts/audit-cli.mjs <run>/<page>.html --type list --states --checks --disposable --json`, always with the branch's CLI. Record the score, the `table-row-*` violations, the state results and confirm.

- [ ] **Step 3: Verify the fixtures.**
  Run: `node skills/enterprise-admin-ui/scripts/audit-cli.mjs tests/agent-eval/r3/s1-existing-layout/orders.html --type list` and the same for `s3-review/customers.html --type form --checks --disposable`.
  Expected: no "Could not audit".
  - S1 may show `table-row-height` / `table-row-two-line`, which is intended; note them in `scenarios.md` as expected.
  - S3 shows no required-rule failures apart from the planted lost-input bug, which the audit cannot see. Record the output.

- [ ] **Step 4: Check that the existing suite ignores the fixtures.**
  Run: `npm test`
  Expected: 0 fail (3 skipped, POSIX-only). `tests/fixture-pages.mjs` reads only `tests/fixtures/`.

- [ ] **Step 5: Commit.**
  `git add tests/agent-eval`
  `git commit -m "test(agent-eval): R3 fixtures and scenarios for existing layout, missing drafts, review-only and a new screen"`

### Controller step A: Baseline runs (old skill)

This is not a task for an implementer, because only the controller can dispatch the agents under test.

1. Prepare the skill copy:
   - `git archive main skills/enterprise-admin-ui | tar -x -C <scratch>/skill-old`
   - Copy each fixture into its own new directory, `<scratch>/runs/<S>-old-<n>/`.
2. Run 5 agents (sonnet), one at a time: S1, S2 and S3 once each, and S4 twice. Use the prompt template verbatim. Wait for each to finish.
3. Grade each run with `scenarios.md`'s Grade section, and write the results to `docs/superpowers/evals/2026-11-10-r3-ab.md` under a "Baseline (main)" heading.
4. Gate: if the old skill passes all of S1–S3, stop and report to the user before starting Task 2.

### Task 2: Skill text — required vs defaults

**Files:**
- Modify: `skills/enterprise-admin-ui/SKILL.md`:
  - Scope and precedence, around `:12-16`;
  - Every screen ships with, around `:27-35`;
  - Create / edit form steps 1 and 4, around `:59-62`;
  - Review mode, around `:202-210`;
  - plus one capability line.
- Modify: `skills/enterprise-admin-ui/references/forms.md`: Layout, around `:17-21`, and "Save draft for long forms", around `:54`.
- Modify: `skills/enterprise-admin-ui/references/tables.md`: Density, around `:22-27`.
- Modify: `skills/enterprise-admin-ui/assets/templates/form.html`: the header comment, around `:15-21`.
- Modify: `CHANGELOG.md`: Unreleased → Changed.
- Regenerate: `adapters/`.

**Interfaces:**
- Consumes: the spec's Design → Text section. That section is the requirement; follow it item by item.

- [ ] **Step 1: Record the word count.**
  Run: `wc -w skills/enterprise-admin-ui/SKILL.md`
  Expected: 3410.

- [ ] **Step 2: Make the text changes, in the spec's order.**
  - The decision order (1 user/repo, 2 existing product and API, 3 invariants in what you build or change, 4 skill defaults) is written exactly in that order.
  - The Required/Defaults split uses exactly the items the spec lists in each group.
  - Review finding lines take the form `path:line — defect|preference — <level> — <rule> — <fix>`.

- [ ] **Step 3: Check the budget, and regenerate.**
  Run: `wc -w skills/enterprise-admin-ui/SKILL.md && npm run build:adapters && npm run check:adapters`
  Expected: at most 3560 words, and "adapters/ matches SKILL.md".

- [ ] **Step 4: Run the full suite.**
  Run: `npm test`
  Expected: 0 fail (3 skipped). The repo-facts tests check SKILL.md's references and front matter.
  Run: `node skills/enterprise-admin-ui/scripts/audit-cli.mjs skills/enterprise-admin-ui/assets/templates/form.html --type form --checks`
  Expected: the same result as before the change. Only a comment changed.

- [ ] **Step 5: Commit.**
  `git add skills CHANGELOG.md adapters`
  `git commit -m "fix(skill): required rules vs defaults; existing conventions and product capabilities take precedence"`

### Controller step B: Candidate runs (new skill)

1. Copy the branch's `skills/enterprise-admin-ui` to `<scratch>/skill-new`, then run steps A.1–A.3 again with `-new-` directories.
2. Compare the results against the ship rule.
3. If the new skill fails a criterion, start Task 2's fix loop with the failing run's evidence. A text revision gets its own re-run of only the failing scenarios. Do at most two revision rounds, then report.

### Task 3: A/B report

**Files:**
- Create or complete: `docs/superpowers/evals/2026-11-10-r3-ab.md`

**Interfaces:**
- Consumes: the graded results from controller steps A and B (the controller has written them into the file).

- [ ] **Step 1: Complete the report.**
  - A results table, scenario × version, giving pass/fail for each criterion and the S4 numbers for each run.
  - A quote from the agent's reply for each S3 verdict.
  - The SKILL.md word count, before and after.
  - Caveats: one or two runs per cell, sonnet as the agent, the scenarios written by the author.
  - The ship decision.

- [ ] **Step 2: Commit.**
  `git add docs/superpowers/evals`
  `git commit -m "docs(eval): R3 A/B results against the released skill"`
