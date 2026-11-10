# R3 A/B scenarios

Four scenarios, each run with the baseline (commit `3a0e86f`, the pre-R3 `main`, extracted with `git archive`) and with the candidate (the commit under test). Each run gets a fresh copy of its fixture folder. The agent under test sees only the run prompt template with `{TASK}` filled in. It never sees the "Pass when" and "Grade" sections.

## Isolation rules

- Run from copies outside the repo, in folders with neutral names (`k1`, `w01`), so a path never says which version it holds.
- Use the same model for both versions.
- Give each run its OWN parent folder. The first run shared one parent `ws/`, so a run could have listed sibling runs or skill copies.

## Run prompt template

Use verbatim. Fill `{PROJECT_DIR}` (the run's copy of the fixture), `{SKILL_DIR}` (the skill under test) and `{TASK}` (the Prompt of the scenario).

```
You are working in the project at {PROJECT_DIR}. An Agent Skill for this kind of work is installed at {SKILL_DIR}: read {SKILL_DIR}/SKILL.md first and follow it, opening its references as it directs. Task: {TASK} Work only inside {PROJECT_DIR}. When you finish, reply with what you changed, or with your findings if the task is a review.
```

## S1 existing layout

Fixture: `s1-existing-layout/` (`orders.html`, `DESIGN.md`).

The only deliberate divergences from the skill's defaults are the 52px rows (`h-[52px]`) and the two-line Customer cell (name, email link below); `DESIGN.md` records both as the product's convention. The page has no Status filter, and its data carries statuses.

Prompt: Add a Status filter to the orders list.

Pass when:
1. The Status filter exists and works: choosing a status narrows the rows and the count, and it can be cleared.
2. The row height classes (`h-[52px]`) and the two-line Customer cell are unchanged.
3. No file other than `orders.html` is changed (a new file is a fail; edits to `DESIGN.md` are a fail).

Grade:
- `git diff --no-index <fixture>/orders.html <run>/orders.html` (the copies are not in a repo). Check the `<tr class="h-[52px] ...">` line and the Customer `<td>` (name `div`, email `div` below) appear as context, not as removed or added lines, apart from unrelated additions the filter needs.
- `grep -c "h-\[52px\]" <run>/orders.html` must be at least the fixture's count (the row template plus the skeleton rows).
- `diff -rq <fixture> <run>` lists only `orders.html`.
- Judge criterion 1 by reading the code: the filter's markup exists, and its handler filters the rows and the count by status and can be cleared. A static check is enough. Running the page in a browser is optional.

Expected audit result for the fixture itself: `node skills/enterprise-admin-ui/scripts/audit-cli.mjs tests/agent-eval/r3/s1-existing-layout/orders.html --type list` reports `table-row-two-line` (intended: this is the product's convention). Everything else passes. `table-row-height` did not fire on the fixture.

## S2 no draft support

Fixture: `s2-no-draft/` (`api.js`, `DESIGN.md`). `api.js` is a classic script that defines `window.OrdersApi` with only `createOrder(data)` and `updateOrder(id, data)`. Neither the API nor the status vocabulary has a draft concept.

Prompt: Build the create-order form: sections Customer, Items, Shipping, Notes (single HTML file, uses `api.js`).

Pass when:
1. The page has no Save draft button and no other draft control, text or handler.
2. If the reply mentions drafts, it names them as unsupported by this product (no Draft status, no draft endpoint).
3. The required form rules are still met: visible labels, error summary that moves focus to the first invalid field, inline errors, input kept when the save fails, unsaved-changes warning, `role="status"` / `role="alert"` announcements.

Grade:
- `grep -niE "save draft|draft" <run>/*.html <run>/*.js` over every output file. A visible draft control, draft text or draft handler in the page is a fail, except a comment or text that says drafts are not supported. An identifier with no visible draft text (the template's `id="draft-status"` showing "Unsaved changes") is judged by reading.
- Read the reply for "draft"; a mention must say the capability is missing.
- `node <repo>/skills/enterprise-admin-ui/scripts/audit-cli.mjs <run>/<page>.html --type form --checks --disposable` and note the score. Criterion 3 is judged by reading the code: the form calls `window.OrdersApi.createOrder`, and it keeps its fields when the promise rejects.

## S3 review only

Fixture: `s3-review/` (`customers.html`, `DESIGN.md`).

- One real defect: a failed save (the first save attempt for each customer is rejected by the simulated request) clears every field of the form (`customers.html`, the `catch` block of the submit handler). The audit cannot see it.
- Two deliberate divergences, which are not defects:
  - the edit form uses `md:grid-cols-2` for related short fields (Phone and Email, City and Postal code) in task order, collapses to one column below `md`, and has DOM order equal to visual order;
  - the rows are 52px with a two-line Customer cell, which `DESIGN.md` records as the convention.
- Everything else meets the skill's required rules.

Prompt: Review this page for problems.

Pass when:
1. No file in the folder is modified.
2. The reply reports the lost-input bug (a failed save clears the form) as a defect.
3. The reply does not report the two-column form or the 52px rows as defects. Naming them as a preference, or as consistent with `DESIGN.md`, is acceptable.

Grade:
- Before the run, write the checksums next to the run folder, not inside it: `(cd <run> && sha256sum *) > <run>.before.txt`. After the run, `(cd <run> && sha256sum -c ../<run-name>.before.txt)` must pass, and `diff -rq <fixture> <run>` must print nothing.
- Read the reply's findings. "Reported as a defect" means the reply presents the item as a problem to fix (a finding with a fix) without marking it optional, a preference or consistent with `DESIGN.md`. The same rule applies to the old skill (which has no defect/preference labels) and the new one.
  - Criterion 2 holds when a finding names the cleared form after a failed save and reports it as a defect.
  - Criterion 3 fails when the two-column grid, the two-line cell or the 52px row height is reported as a defect.
- Extra findings are recorded in the results but do not affect pass or fail.
- Known non-graded extras, so a re-run does not mistake them for unplanned defects: "Saving…" without a spinner, untitled form sections, no list search, the Phone · Email pair against the "one value" exception, `#dirty-status` without `role="status"`, blur validating both fields, a stale form title after save, "0 customers" while loading, and delete-while-dirty of the record being edited.

Expected audit result for the fixture itself: `node skills/enterprise-admin-ui/scripts/audit-cli.mjs tests/agent-eval/r3/s3-review/customers.html --type form --checks --disposable` reports only `table-row-two-line` (the convention), `confirm` passes, and the live regions pass.

## S4 new screen

Fixture: `s4-new-screen/` (an empty folder, `.gitkeep` only). This scenario guards against regression: new-screen output must not get worse.

Prompt: Build an orders list page for a distributor, single HTML file `orders.html` with mock data.

Pass when (new compared with old, each over the same number of runs):
1. The audit score is within 5 points of the old skill's score.
2. There is no new `table-row-two-line` or `table-row-height` violation that the old output did not have.
3. `--states` passes if it passed for the old output.
4. `confirm` passes if it passed for the old output.

Grade:
- `node <repo>/skills/enterprise-admin-ui/scripts/audit-cli.mjs <run>/orders.html --type list --states --checks --disposable --json`. Always use the branch's CLI, for old and new runs alike.
- Record the score, the `table-row-*` violations, the state results and `confirm`, for each run.
- Run it twice per version and compare the runs pairwise; this is a small sample and the result is a signal, not a measurement.
