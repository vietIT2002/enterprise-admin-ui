# Multi-page consistency and redesign: skill changes (part 2)

Status: proposed, 2026-11-24. Project-sized. Part 2 of measure → fix → re-measure. It is merged only after part 3 has measured it (see Delivery).

**Inputs:**
- part 1 spec `2026-11-19-consistency-eval-design.md`;
- baseline report `docs/superpowers/evals/2026-11-19-consistency-baseline.md`, in particular "What was weak, in order".

Part 3 re-measures with the same grader after fixing the grader limits that the report lists.

## Why

End users reported two problems with the skill:
- the same function is designed differently on different pages ("pagination looks one way here and another way there");
- applying the skill to an AI-made attendance admin changed it by "maybe 10%".

The part 1 baseline was four runs of the released skill on an AI-made five-page attendance admin. Its findings:
- **Pagination was inconsistent in 4 of 4 runs, and so was the filter bar.**
  - The agents restyled each page's pager and kept its mechanism: numbered pages, Prev/Next, or "Load more".
  - The same filter (status) was tabs on one page and a select on another.
- **The skill has no step for unifying pages.**
  - Nothing tells the agent to list the patterns that pages share, pick one implementation and move every page to it.
  - The skill offers alternatives (status tabs or a select; inline filters or a "More filters" panel; `tables.md` even allows infinite scroll) and never says to choose once per app.
- **`DESIGN.md` holds no shared patterns.**
  - The template's Components section is one generic line.
  - The two "Redesign…" runs wrote no `DESIGN.md` at all.
- **The audit cannot see the problem.**
  - It checks pages one at a time and has no pagination rule.
  - The agents treated its 100 as the finish line. SKILL.md's own "Pagination with page size and total" was met on all three list pages in only 1 of 4 runs.
- **On the "10%" complaint, the content area changed as much without the skill as with it.**
  - The skill's extra change was the sidebar.
  - SKILL.md:14 keeps a project's existing theme ("keep its components and tokens"). An AI-made app usually has one, such as a customised shadcn theme, so in a real project the skill would keep the AI look and change layout only. The fixture has no theme, so this is untested.

## Decisions taken with the user

- **Theme (option B).**
  - An existing theme is kept, except its values that are template tells in `references/anti-patterns.md`. Those are replaced with the Foundations values.
  - An accent is kept when `DESIGN.md` or the user names it as the brand.
  - When unsure, keep the colour, change the rest, and say so in the reply.
- **An accent nobody names (answered after the builder check).**
  - An undeclared accent, typically indigo, is kept.
  - The reply names it and offers the Foundations accent, for example: "I kept your accent #4f46e5. If it is not your brand colour, say so and I will switch it to #1d4ed8."
  - The sidebar, gradients, oversized radius and card shadows are still replaced.
- **Consistency (approach 2).**
  - Guidance changes, plus one per-page audit rule for pagination.
  - No cross-page compare tool in this part.
- **Merge order (answered after the builder check).**
  - `npx skills add` installs from `main`, so part 2 is not merged until part 3 has measured it. See Delivery.

## Goals

1. When a task covers two or more screens of one app, the agent unifies the shared patterns before or while changing screens. The patterns are pagination, filter bar, page header, status badge, dates and table rows. For each, the agent picks one implementation, records it in `DESIGN.md`, builds it once and moves every screen to it, behaviour included.
2. `DESIGN.md` is created whatever the request is called ("apply", "improve", "redesign"), and it carries a Shared patterns section with defaults.
3. A list page whose pager lacks the total or a page-size control, or that uses "Load more" for records, loses audit points.
4. When the skill is applied to a whole app or the app is redesigned, the theme's template-tell values are replaced at their source. These are the navy sidebar, gradients, glass, card shadows, oversized radius and one colour per status. The accent and brand colours stay, and the reply names an accent that nobody declared.
5. Review mode reports a shared pattern implemented differently on two screens as a finding.

## Non-goals

- **A cross-page compare command** in `audit-cli` (approach 3). This is the next candidate if part 3 shows that the filter bar stays inconsistent.
- **Grader changes.** They belong at the start of part 3.
- **A pixel-change target.** The report's advice stands: more changed pixels is not a goal.
- **A React fixture,** and any change to the fixture or to the stored baseline.
- **New template-tell entries** in `anti-patterns.md`. Adding one changes the anti-pattern count that the READMEs state, and none is needed.

## Anti-goals (what would make this a failure even if it works)

- **Changing more than was asked.** If the user asks to change one screen of a larger app, the agent migrates the other screens too. This breaks R7 ("scale work to the requested task").
- **Breaking product behaviour to unify a pattern.** For example, the agent replaces "Load more" over an API that pages only by cursor, so the list no longer loads. This breaks R3: product and API behaviour come before skill defaults.
- **Overwriting a real design system or brand colour** without saying so.
- **A mandatory loop or extra pass that raises cost** without improving output. The CHANGELOG records two such attempts: a template-and-checker loop at 1.65× cost and a check-before-finish pass at 1.41×. Neither improved the checklist.
- **SKILL.md growing by more than about 15 lines.**

## Constraints

- **No AI attribution** in commits, the PR or any pushed text.
- **Generated and counted files stay in step:**
  - adapters are generated from SKILL.md, so run `npm run build:adapters` after editing it, and `tests/adapters.test.mjs` checks them;
  - `tests/repo-facts.test.mjs` checks the rule count, the SKILL.md line count and the reference count stated in `README.md`, `README.vi.md`, `README.zh-CN.md` and `CHANGELOG.md`. The audit rule count goes from 22 to 23.
- **The audit stays dependency-free.** It is plain browser JS, run through `audit-cli.mjs`, a console paste or Playwright.
- **Tests that start a browser never run at the same time on this Windows machine.** Run `npm test` alone.

## Approaches considered

1. **Guidance only.** Add a shared-patterns step, the `DESIGN.md` section and "choose once per app" lines.
   - It is the cheapest option and adds no code.
   - The risk is that agents skip the step, as the P2 runs skipped `DESIGN.md`.
2. **Chosen: guidance plus a per-page `pagination` audit rule.**
   - The baseline shows that agents run the audit until it scores 100, so a rule gets followed. This one pushes every list page towards the same pager parts: range and total, page size, and Previous/Next.
   - It is per-page like every other rule, so it adds no step and no new tool.
   - It cannot see the filter bar differing between pages. That part rests on the guidance, and part 3 will show whether that is enough.
3. **Guidance plus a cross-page compare command** (`audit-cli a.html b.html --compare`).
   - It would catch every shared pattern.
   - It needs the most code and adds a step to every run.
   - It would also mirror the part 1 grader, so part 3's measurement would be less independent.
   - It is deferred to after part 3.

## Design

### 1. Theme rule (SKILL.md "Scope and precedence")

Amend the existing design-system line (SKILL.md:14) as follows:
- Keep the project's components and tokens, **except values that are template tells** (`references/anti-patterns.md`). Replace those with the Foundations values where they are defined: the theme file, the CSS variables, or the shared component class. Do not patch them page by page.
- A colour stays when `DESIGN.md` or the user names it as the brand.
- **The accent stays even when nobody has declared it** (the user's answer).
  - The reply names it and offers the Foundations accent `#1d4ed8`.
  - Only the navy or dark sidebar half of the "navy sidebar with an indigo accent" tell is replaced.
- The reply lists the theme values that were replaced.

**Which themes (my call after the builder check).**
- The exception covers only values the project defines in its own files: CSS variables such as `globals.css`, the Tailwind config, or a theme object in the repository.
- A published library's defaults (MUI, Ant Design) and an installed kit package count as a design system. They stay, as they do today.
- Reason: the user rejected option C because it would break a company's real design system.

**When it runs (my call after the builder check).**
- Only when the task applies the skill to the app, redesigns it, or asks for a new look.
- On a narrower task, such as "add a Status filter to Orders", the theme stays and the reply may name the tells it saw.
- Reason: this follows R3's acceptance criterion "an existing theme survives a narrowly scoped change", and anti-goal 1.

**READMEs.** The promise that the design system "always wins" changes to match this. It appears in `README.md` "What it is for" and in the FAQ "Will it fight my design system?", and in the same places in `README.vi.md` and `README.zh-CN.md`.

Add a short subsection to `references/tokens.md`, "Replacing a template theme". It covers where these values live in a shadcn theme (`--radius`, `--sidebar*`, `--primary`, card shadow classes) and in plain CSS variables, and how to keep a brand accent while changing the rest.

Add one line to the "How to use" section of `references/anti-patterns.md`: in a project with its own theme, fix a tell where the theme defines it, once.

### 2. Shared-patterns step (SKILL.md "Workflow")

**Step 1 changes.** Create `DESIGN.md` before changing any screen, whatever the request is called. The trigger stays as it is: no `DESIGN.md`, and more than one screen.

**A new step after it.** Proposed wording; the builder may tighten it:

> **Shared patterns:** when the task builds, redesigns or applies this skill to two or more screens of one app:
> - List how each screen does pagination, the filter bar, the page header, status badges, dates and table rows.
> - Choose one implementation for each. Use DESIGN.md's Shared patterns, or its defaults when the section is empty.
> - Build each one once (one component, partial or shared script) and move every screen to it, behaviour included. A list that uses "Load more" gets the same pager as the others.
> - Keep a different pattern only when the product needs it, for example an API that pages by cursor only. Write the reason in DESIGN.md and in the reply.
> - A change to one screen of a larger app reuses the existing shared patterns and leaves the other screens alone.

The later steps are renumbered.

**One screen of an app whose screens disagree (my call after the builder check).**
- The changed screen takes the target pattern from DESIGN.md's Shared patterns. When the section is new, that means its defaults.
- DESIGN.md lists the screens not yet moved, and the reply offers to move them.
- The other screens stay as they are.
- Reason: copying one of the disagreeing screens would pick a pattern at random. The `pagination` rule already points to the default, and the user asked for a change to one screen only.

### 3. `DESIGN.template.md`: a "Shared patterns" section

Add a "Shared patterns" section after Components. It is a table with one row per pattern and pre-filled defaults, which agents keep or replace with the app's own choice:

| Pattern | Default |
|---|---|
| Pagination | Below the table. "1–25 of 128" on the left. Rows per page (25 · 50 · 100) and Previous / Next on the right. Record lists never use Load more or infinite scroll. |
| Filter bar | Search on the left (280–320px), up to three filters, More filters (n), chips with Clear all. A filter that appears on several lists uses the same control on all of them. Status is shown as status tabs with counts on every list whose records have a status. |
| Page header | Breadcrumb on pages that have a parent. Top-level lists have none, or all of them show the module. Title on the left, one primary action on the right. |
| Status badge | See Status vocabulary. |
| Dates and numbers | See Locale. |
| Table rows | 40px, one line. |
| Empty, loading, error | One component each, used on every list. |

The section opens with one line:
> Every screen uses these. Build each once and reuse it. A screen that cannot follow one names the reason in the Decisions log.

### 4. "Choose once per app" in the references

- **`references/filters-search.md`, Filter bar rules.**
  - A filter that appears on several lists (Status, Date, Owner) uses the same control and position on all of them. Status tabs on one list and a Status select on another read as two products.
  - Record the choice in DESIGN.md's Shared patterns.
  - The status tabs section adds: when one list has status tabs, every list with a status workflow has them.
- **`references/tables.md`, Pagination.**
  - Every list of the app uses one pager component.
  - The page-size select is shown on every paged list, so the pager is the same everywhere. This replaces "above 50 rows". The "Go to page" jumper beyond 5 pages stays.
  - Record lists use the pager. Load more and infinite scroll suit feeds (activity, notifications), not find-and-compare lists.
- **`references/navigation-layout.md`, Breadcrumbs.** Pages at the same level are treated alike. If one top-level list shows the module crumb, every top-level list does.

### 5. SKILL.md list recipe, review mode and checklist

- **List recipe item 6 becomes:** "Pagination: the app's one pager (DESIGN.md Shared patterns): range and total, Rows per page, Previous / Next. Not Load more."
- **Review mode step 2 adds:** compare the reviewed screens with each other. A shared pattern implemented differently on two screens is one `layout` finding that names both files.
- **The manual checklist adds:** "[ ] Every screen uses DESIGN.md's Shared patterns: the same pager, filter controls and page header. Exceptions are written down."

### 6. Audit rule `pagination` (`scripts/audit.js`)

**When it runs.**
- It runs on list pages only (`pageType: 'list'`), like the label rules that run on form pages only.
- A page with no pager and no Load more is not measured. A short list needs no pager.

**What counts as a pager.** A control group below the first visible data table and outside its rows that contains one of the following:
- a next-page control: a button or link named Next, Next page, Sau, Trang sau, Tiếp, ›, », or with `rel=next`;
- two or more sibling page-number controls;
- a container labelled or classed as pagination, pager or phân trang.

**What counts as Load more.** A button or link below the table named Load more, Show more, Xem thêm or Tải thêm.

**Violations.** One rule id, `pagination`, with severity `warn` (4 points). Each finding names what is missing:
- the page uses Load more on a record list;
- the pager shows no range or total. Range forms: "1–25 of 128", "1–25 trên 128", "1–25 / 128". Total forms: "128 results", "Tổng 128";
- the pager has no page-size control. That means a select or combobox in the pager, or one labelled Rows per page, Per page, Page size, Số dòng, Hiển thị or Mỗi trang, or a select whose options are all integers.

**Exceptions (my call after the builder check).**
- There is no opt-out flag or marker.
- A page that keeps a different pager for a product reason (an API that pages by cursor only) keeps its warning. The rule's message says this exception is allowed when its reason is written in DESIGN.md and in the reply.
- SKILL.md Verify already says to review every warning.
- Reason: an opt-out would add work to `audit.js`, `audit-cli`, fixtures, docs and tests for a rare case.

**Why `warn` and not `error`.** An error means data loss or an accessibility failure and makes `audit-cli` exit 1. A missing page-size control is neither. A warning still keeps the score below 100, which is what the agents act on.

**Bookkeeping.**
- `RULES` gets `pagination`, so the rule count goes to 23.
- The README badges and text are updated, and the CHANGELOG gets an entry.
- The message follows the style of the other rules: "List pagination shows the range and total ('1–25 of 128'), a Rows-per-page select and Previous / Next; record lists do not use Load more".

**Known effects.**
- **Shipped list template** (`assets/templates/list.html`) and the shadcn `OrdersPagination` example: they already have range, page size and Previous/Next, so they must pass.
- **Reference orders list in `tests/app/`:** it has range and Previous/Next but no page-size control.
  - Add one to its markup, so it stays a clean reference. It is dev-only.
  - Check `tests/app.test.mjs` and `tests/workflows/` for assertions on its warnings.
- **Consistency fixture:** the audit score on its three list pages goes down.
  - The tests in `tests/consistency-eval.test.mjs` do not pin audit scores. The builder confirms this by running them.
  - The stored baseline `report.json` files keep the old audit. Part 3 regrades the baseline with the new audit before comparing audit means.

## Testing

- **New audit fixture pages** in `tests/fixtures/`, each declaring its expected rules through the existing `<meta>` format:
  - a numbered pager with range text and no page size → `pagination`;
  - Load more under a table → `pagination`;
  - a pager with range, page size and Previous/Next, in English → clean;
  - the same in Vietnamese ("1–25 trên 128", "Số dòng", "Trang sau") → clean;
  - a list with no pager → clean;
  - a pager-like control group that is not pagination, such as a row of filter buttons or table-row action buttons, → clean.
- **`audit-internals` unit tests** for any pure helper added, such as range or total text matching.
- **A new test (my call after the builder check):** no test audits `assets/templates/list.html` or the `tests/app` reference orders list today. Add one that runs `audit.js` on both with `pageType: 'list'` and expects no `pagination` finding.
- **Existing suites keep passing:**
  - the `--checks` tests on the templates still exit 0;
  - the adapters and repo-facts tests pass.
- `npm test` is run alone at the end.

## How part 3 will judge this

These are proposed bars for the re-measurement, which uses the same prompts, model and counts as the baseline. Part 3 first fixes the grader limits listed in the report.

**Consistency:**
- Pagination consistent in at least 3 of 4 skill runs (baseline: 0 of 4).
- Filter bar consistent in at least 3 of 4 (baseline: 0 of 4).

**`DESIGN.md`:** written with a filled Shared patterns section in 4 of 4 skill runs, P2 included. In the baseline, 2 of 4 runs wrote one, and none had shared patterns.

**No regression:**
- 0 counted tells and function kept 5/5 on every run.
- Audit 100 under the new audit.

**Theme variant** (new fixture in part 3):
- The theme's tell values (sidebar, gradients, radius, card shadows) replaced in at least 3 of 4 runs.
- The accent kept in every run, and named in the reply when it was undeclared.

**Scope and review (scenarios added in part 3):**
- **One screen in a multi-screen app.** A request to change one screen changes that screen and `DESIGN.md` only (anti-goal 1).
- **R3's S1 and S3 re-run.** In S1 the change touches one file only. In S3, a review, nothing is modified (`tests/agent-eval/r3/scenarios.md`).
- Part 3's design decides whether a cursor-only pager scenario (anti-goal 2) is worth its cost.

**Cost:**
- Mean time per skill run at most 1.3× the baseline's 448 s.
- Mean tool uses per skill run at most 1.3× the baseline's 19.

If pagination improves and the filter bar does not, approach 3 is the next candidate.

## Delivery

1. Part 2 is built on `feat/consistency-skill`, reviewed and tested, and pushed. It is **not merged**.
2. Part 3 starts with the grader fixes, in their own test-only PR to `main`.
3. Part 3 runs the agents on the part 2 branch's skill and writes its report.
4. If the bars above are met, part 2 merges together with the part 3 report. If they are not, part 2 changes on its branch and is measured again.

## Left to the builder

- Exact wording of every added line. Keep the existing tone, and keep SKILL.md growth to about 15 lines.
- The pager and total-text matching details. They must cover English and Vietnamese and pass the fixture pages above.
- Where the `tokens.md` subsection sits and how long it is.
- Whether the audit's `VERSION` constant and the package version change. Follow how the R3 and R4 changes handled it.
