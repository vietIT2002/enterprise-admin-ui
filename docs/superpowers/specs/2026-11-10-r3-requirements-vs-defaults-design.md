# Separate requirements from defaults, and keep what the app already does (roadmap R3)

Status: proposed, 2026-11-10. Medium-sized.

## Why

The skill states three kinds of rule in the same absolute voice:

- invariants that protect data and access, such as keeping input when a save fails, or keyboard use;
- interaction defaults, such as explicit Save or one primary action;
- presentation defaults, such as 40px single-line rows or one-column forms.

On an existing app, an agent then rewrites validated layouts, or adds features the product cannot back. The concrete cases are these:

- **Precedence.** `SKILL.md:14` keeps a project's components and tokens, but "apply[s] the layout, state and behaviour rules below". The skill's layout wins over the app's own.
- **Save draft.** "A form with three or more sections also offers Save draft" (`SKILL.md:62`, `references/forms.md:54`) adds an action that needs a Draft status, an API and permissions, which the product may not have. The `assets/templates/form.html` template ships that button.
- **Absolute layout rules.** "Every row is one line" (`tables.md` Density) and "never lay a section out on a `grid-cols-2`" (`forms.md` Layout, `SKILL.md:59`) are stated as absolute.
- **Review mode.** `SKILL.md:202-210` groups findings by level, but does not separate a defect from a preference.

Constraint: the measured gain (checklist 19% → 44%) comes partly from these strong defaults on new screens, such as "100% of generated lists stacked two lines". Softening them must not weaken new-screen output.

## Goals

- A decision order the agent follows when rules conflict:
  1. the user's request and the repository's constraints;
  2. the product's existing behaviour and API;
  3. accessibility and data invariants, in whatever the agent builds or changes;
  4. the skill's defaults.
- Every rule in "Every screen ships with" is marked either **required** (always, and verified) or a **default** (new screens; on an existing screen, the project's established convention wins).
- Optional capabilities (Save draft, export, approval steps, background jobs) are added only when the user asks or the product already supports them. If one is missing, the agent says what is missing instead of inventing it. This covers approval roles, legal calculations and status transitions.
- Layout rules for tables and forms read as defaults with conditions. A two-column form is acceptable if:
  - it follows the task order;
  - its tab order matches the visual order;
  - it reflows to one column at narrow width.
- Review mode labels each finding `defect` (an invariant is broken) or `preference` (it differs from a default), and changes code only when asked, within the asked scope.
- New-screen output does not get worse.

## Non-goals

- Audit rule changes. `table-row-height` still reports rows outside 32–48px; that belongs to R4.
- A full blind-reviewed evaluation, which belongs to R5.
- Rewording rules unrelated to the cases above.

## Approaches considered

1. Text only, with review. This is cheap, but there is no evidence that agents behave differently, and no check that new screens did not get worse.
2. **Chosen:** text, plus a small A/B with agents. There are 4 scenarios, each run with the released skill (`main`) and the candidate. This is enough to show the change works and does not cost new-screen quality, at about 10 agent runs.
3. A full evaluation with blind reviewers. This is the most reliable, but it is R5's scope and cost.

## Design

### Text

**`SKILL.md`, Scope and precedence**
- Replace the "apply the layout, state and behaviour rules below" sentence with the four-step decision order.
- On an existing screen:
  - keep the project's components, tokens and established layout conventions (row style, density, form arrangement) unless the user asks to change them;
  - apply the required rules to what you build or change;
  - report existing violations elsewhere instead of rewriting them.

**`SKILL.md`, Every screen ships with**
- Split the list into **Required**:
  - states (empty with its next action, loading, error with Retry);
  - confirmation for destructive actions;
  - a form keeps the user's input when a save fails, with an error summary that moves focus to the first invalid field and errors next to their fields;
  - visible labels;
  - an unsaved-changes warning;
  - announcements with `role="status"` / `role="alert"`;
- and **Defaults**, with "on existing screens, the project's convention wins":
  - one primary action;
  - single-line rows;
  - dates as an absolute date plus the time left;
  - labels above fields;
  - a sticky Save/Cancel bar;
  - upload limits stated.
- Mock-data `?state=` stays where it is. It is scoped to mock data; R7 revisits it.

**`SKILL.md`, Create / edit form step 4, and `forms.md` "Save draft for long forms"**
- Save draft becomes an optional capability: offer it only when the product stores drafts (a Draft status and an API to save one) or the user asks for it.
- Otherwise leave it out, and say so if a long form would benefit.

**`SKILL.md`, a new one-line capability rule**
- Before adding an action that changes the workflow (Save draft, export, approval, background job), check that the product supports it: an endpoint, a status, a permission.
- If a business rule is unknown, name the missing contract. Do not invent roles, calculations or status transitions.

**`tables.md` Density and `forms.md` Layout**
- Rephrase the absolutes as defaults for new screens, and keep the concrete values and the "Without the skill …" evidence.
- `forms.md` adds when two columns are acceptable, using the three conditions from the goals.
- `SKILL.md:59` ("Never … lay unrelated fields out on a grid") gets the same condition, in a few words.

**`SKILL.md` Review mode**
- Each finding line gets `defect` or `preference`: `path:42 — defect — data — …`.
- Where the project has its own convention, `layout` and `tells` findings are `preference` unless they break an invariant.
- "Change code only when the user asks for fixes, and only within the screens they name."

**`assets/templates/form.html`**
- The header comment says to keep Save draft only if the product stores drafts, and otherwise to delete the button and its handler.
- The button stays in the template, so the template still shows the pattern.

**Budget**
- `SKILL.md` (3,410 words) grows by at most about 150 words, net.
- Detail moves into `forms.md` and `tables.md` rather than the entrypoint.
- `npm run build:adapters` regenerates the adapters.

**CHANGELOG, Unreleased**
- Add a "Changed" entry.

### A/B evaluation

**Fixtures:** `tests/agent-eval/r3/`, each a tiny project folder. `scenarios.md` holds the prompts and the pass criteria, so the eval is re-runnable.

| ID | Fixture | Prompt (summary) | Pass when |
|---|---|---|---|
| S1 existing layout | `orders.html` with 52px rows and a two-line Customer cell (name, email below), and a `DESIGN.md` that records that convention | "Add a Status filter to the orders list." | The filter works. The row height classes and the two-line cell are unchanged. No file outside the list is changed. |
| S2 no draft support | `api.js` exporting only `createOrder` and `updateOrder`; a `DESIGN.md` | "Build the create-order form: sections Customer, Items, Shipping, Notes (single HTML file, uses `api.js`)." | No Save draft or draft control. If drafts are mentioned, they are named as unsupported. The required form rules are still met. |
| S3 review only | `customers.html`. One real defect: a failed save clears the form. Two deliberate divergences: an `md:grid-cols-2` form of related short fields that reflows, and 52px rows recorded in `DESIGN.md`. | "Review this page for problems." | No file is modified. The lost-input bug is reported as a defect. The two-column form and the row height are not reported as defects. |
| S4 new screen | an empty folder | "Build an orders list page for a distributor, single HTML file with mock data." | Graded with `audit-cli --type list --states --checks --disposable`: score, row violations, states, confirm. New must not be worse than old: the score is within 5 points, there is no new `table-row-two-line` / `table-row-height` ✗, `--states` passes if old passed, and confirm passes if old passed. |

**Runs**
- The controller dispatches one subagent per run (model: sonnet). The prompt and context are the same for every run, apart from the skill path.
- The old skill is extracted from `main` with `git archive` into a temp directory; the new one is the branch's `skills/enterprise-admin-ui`.
- Each run gets a fresh temp copy of its fixture.
- Run count: S1–S3, old and new, once each; S4, old and new, twice each. That is 10 runs.

**Grading**
- Grading is mechanical where possible: a diff of the fixture copy, a grep for draft controls, audit-cli for S4.
- For S3, the controller reads the reply's findings.

**Order**
- Baseline first. The old runs happen before the text changes, as in writing-skills.
- If the old skill already passes S1–S3, report that before changing text, because the change would then be weakly justified.

**Ship rule**
- The new skill passes S1–S3, and S4 does not get worse.
- If the new skill fails, revise the text at most twice, then report.
- Results go into `docs/superpowers/evals/2026-11-10-r3-ab.md`: a table per scenario × version, the evidence, and the caveat that this is one or two runs.

## Scope after baseline (2026-11-10)

The baseline with the released skill gave S1 PASS, S3 PASS, S4 100/100 twice, and S2 FAIL: the agent added "Save draft" "because the form has four sections" and saved with a "Draft" status that the product's DESIGN.md and api.js do not have. The user decided to narrow the change to what the evidence needs: Save draft becomes optional (SKILL.md form step 4, forms.md, the form.html comment), SKILL.md workflow step 2 gains a product-capability check, and CHANGELOG records it. The other Design -> Text items (decision order, Required/Defaults split, Review mode, tables.md Density, forms.md Layout) are deferred, not done.

## Builder's calls

- The exact wording within the budget.
- The fixture content, as long as each fixture is small (one page plus `DESIGN.md` / `api.js`) and has only the properties in the table.
- How a run's diff and reply are captured.

## Done when

- The A/B report shows the new skill passing S1–S3 and no worse on S4, or a report explains why not.
- `npm test` and `npm run check:adapters` pass.
- The SKILL.md growth is within budget.
- Commits and PR text carry no Claude or Claude Code attribution.
