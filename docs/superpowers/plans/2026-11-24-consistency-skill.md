# Consistency skill changes (part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skill design each shared pattern once and reuse it on every screen. Add a per-page `pagination` audit rule. Replace a project theme's template-tell values when the skill is applied to a whole app.

**Architecture:**
- **Guidance:** changes in SKILL.md, `DESIGN.template.md` and four references.
- **One new rule in `scripts/audit.js`:** plain browser JS, with pure helpers exposed on `_internals` for unit tests.
- **Fixtures:** HTML fixture pages declare their expected rules through `<meta>` tags.
- **Reference pagers:** the shipped list template and the dev app's orders list get pagers that pass the new rule.

**Tech Stack:** Node ≥ 22, `node:test`, Playwright 1.64.1 (tests only), plain HTML/CSS/JS.

**Spec:** `docs/superpowers/specs/2026-11-24-consistency-skill-design.md`

**Branch:** `feat/consistency-skill`. The branch is pushed but **not merged**; part 3 measures it first (spec, Delivery).

## Global Constraints

**Commits and git:**
- No AI attribution anywhere: no `Co-Authored-By` trailer, and no "Generated with" line, in commits or any pushed text.
- Never `git add -A` or `git add .`. Stage files by name. The untracked file `2026-11-10-enterprise-admin-ui-improvement-roadmap.md` must stay unstaged.

**Audit code:**
- `audit.js` stays dependency-free. It must still run as a console paste and through `require()` in Node.
- Do not change `audit.js` `VERSION`, `package.json` or the CHANGELOG version headings. The release sets them.
- Rule id `pagination`, severity `warn`, list pages only (`pageType: 'list'`). It goes in `RULES` right after `table-above-fold`.

**SKILL.md and the docs that track it:**
- SKILL.md may grow by about 15 lines in total across all tasks (it is 249 lines now).
- After every SKILL.md edit:
  - run `npm run build:adapters`;
  - update the SKILL.md line count where the READMEs state it:
    - `README.md`: the tree line `SKILL.md … N lines` and the FAQ line `SKILL.md is N lines`;
    - `README.vi.md`: `N dòng` in the tree line, and `dài N dòng` in the FAQ;
    - `README.zh-CN.md`: `N 行` in the tree line, and `共 N 行` in the FAQ.
- Skill files are in English, in the existing tone (short declarative lines, sentence case).
- CHANGELOG entries go under `## [Unreleased]`, in `### Added` or `### Changed`.

**Running tests:**
- Tests that start a browser never run at the same time as each other. Run test files one at a time.
- The full `npm test` is run by the controller alone, at the end.

## Review Focus

Each of these failure modes has a test in the task named after it.

- **A pager whose range text is still empty while rows load** (skeleton, or the first fetch still pending): the rule must not fire. A table with no data rows is not measured. Test: fixture `list-pager-loading.html`, in Task 1.
- **Component-library pager labels:**
  - MUI: "Go to next page", "Rows per page:", "1–10 of 128";
  - Ant Design: title "Next Page", "10 / page", "Total 128 items";
  - shadcn's `OrdersPagination`: "Previous", "Next", "25 per page".
  The rule must recognise them. Test: `_internals` unit tests, in Task 1.
- **Totals with grouped thousands** ("1–25 of 1,284", "1–25 trên 1.284", "1 284") and an estimated total ("50+"): they count as a total. Test: unit tests, in Task 1.
- **Look-alike controls must not count as pagination:** a "Show more" or "Xem thêm" inside a table cell, number buttons or a "Next" button above the table, and row actions. Test: fixture `list-pager-lookalikes.html`, in Task 1.
- **Vietnamese labels in other cases or with diacritics** ("TRANG SAU", "Xem Thêm", "Số dòng"): they are recognised. Test: unit tests, in Task 1.

---

### Task 1: Audit rule `pagination`

**Files:**
- Modify: `skills/enterprise-admin-ui/scripts/audit.js`. Change `RULES` (line 23), add a check next to `checkTablePlacement` (line ~733), add it to `CHECKS` (line ~1155) and to `_internals` (line ~1193).
- Modify: `tests/audit-internals.test.mjs` (the rule count goes from 22 to 23; add helper tests).
- Create, based on `tests/fixtures/list-clean.html` (copy its styles and table so that every other rule stays clean):
  - `tests/fixtures/list-pager-no-size.html`
  - `tests/fixtures/list-load-more.html`
  - `tests/fixtures/list-pager-clean.html`
  - `tests/fixtures/list-pager-clean-vi.html`
  - `tests/fixtures/list-pager-lookalikes.html`
  - `tests/fixtures/list-pager-loading.html`
- Modify: `README.md`, `README.vi.md`, `README.zh-CN.md`. Change the rule count 22 → 23 in the badge (`audit%20rules-22-`) and in the `scripts/audit.js … N rules` tree line.
- Modify: `CHANGELOG.md`, adding an entry under `### Added`.

**Interfaces:**
- Produces, on `enterpriseAdminAudit._internals`, all pure (string in, boolean out):
  - `hasRangeOrTotal(text: string): boolean`
  - `isNextPageName(name: string): boolean`
  - `isLoadMoreName(name: string): boolean`
  - `isPageSizeLabel(text: string): boolean`
- Produces: rule id `'pagination'` in `enterpriseAdminAudit.rules`. Tasks 2–4 rely on this id.

- [ ] **Step 1: Write the failing unit tests** in `tests/audit-internals.test.mjs`

Change `test('rules: 22 unique names…')` to expect 23, and assert `audit.rules.indexOf('pagination') === audit.rules.indexOf('table-above-fold') + 1`. Add the tests below.
- `test('hasRangeOrTotal: range and total text in English and Vietnamese')`
  - True for: `'1–25 of 128'`, `'1-25 of 128'`, `'1–25 of 1,284'`, `'1–25 trên 1.284'`, `'1–25 / 128'`, `'1 – 25 of 50+'`, `'Showing 1 to 10 of 57 entries'`, `'Total 128 items'`, `'128 results'`, `'Tổng 128'`, `'Tổng: 1 284'`, `'Hiển thị 1–10 trên 57'`, `'1-10 of 128 items'`.
  - False for: `''`, `'Page 2'`, `'25'`, `'Rows per page'`, `'Next'`, `'2026'`.
- `test('isNextPageName: next-page controls')`
  - True for: `'Next'`, `'Next page'`, `'Go to next page'`, `'Next Page'`, `'Sau'`, `'Trang sau'`, `'TRANG SAU'`, `'Tiếp'`, `'Tiếp theo'`, `'›'`, `'»'`, `'→'`.
  - False for: `'Next step'`, `'Continue'`, `'Save'`, `'Sau đó'`, `''`.
- `test('isLoadMoreName: load-more controls')`
  - True for: `'Load more'`, `'Show more'`, `'View more'`, `'Xem thêm'`, `'Xem Thêm'`, `'XEM THÊM'`, `'Tải thêm'`, `'Load more (10)'`.
  - False for: `'More filters'`, `'More actions'`, `'Load'`, `''`.
- `test('isPageSizeLabel: page-size labels and options')`
  - True for: `'Rows per page'`, `'Rows per page:'`, `'25 per page'`, `'Page size'`, `'Items per page'`, `'10 / page'`, `'10 / trang'`, `'Số dòng'`, `'Số dòng mỗi trang'`, `'Hiển thị'`, `'Mỗi trang'`.
  - False for: `'Status'`, `'All statuses'`, `'Owner'`, `''`.

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/audit-internals.test.mjs`
Expected: FAIL. The rule count is 22, and `t.hasRangeOrTotal` is not a function.

- [ ] **Step 3: Implement the four helpers and `checkPagination(ctx)` in `audit.js`**

**What the check does:**
- **When it runs:** only when `ctx.opts.pageType === 'list'`.
- **Table:** the first visible `table, [role="grid"], [role="table"], [role="treegrid"]`, the same selector `checkTablePlacement` uses. If that table has no visible body rows (use `bodyRows`/`ctx.rows()`), return without measuring.
- **Candidates:** visible controls (`button, a, [role="button"]`) and containers that follow the table in document order (`compareDocumentPosition` & `DOCUMENT_POSITION_FOLLOWING`) and are not inside it.
- **Pager:** the first of these:
  - a control whose `accessibleName(ctx, el)` or `title` passes `isNextPageName`, or that has `rel="next"`;
  - two or more sibling controls whose text is `/^\d{1,4}$/`;
  - an element whose `aria-label` or `class` matches `/pagination|pager|phân trang/i`.
- **Pager region:** walk up from the pager element to the highest ancestor that does not contain the table. The region is that ancestor plus its following siblings in the same parent.
- **Load more:** a candidate control whose name passes `isLoadMoreName`.
- **When neither is found:** return without measuring.
- **Otherwise:** call `measured(ctx, 'pagination', 1)` and collect what is missing:
  - `'Load more'` when a load-more control was found;
  - `'no range or total'` when a pager was found and `hasRangeOrTotal` is false on the region's `innerText`;
  - `'no page size'` when a pager was found and the region has no page-size control. A page-size control is a `select` or `[role="combobox"]` that matches one of these:
    - `isPageSizeLabel` passes on its accessible name, its label, the region's text next to it, or any of its option texts;
    - it is a `select` whose options are all integers, optionally followed by `/ page` or `/ trang`.
- If anything is missing, call `report(ctx, 'pagination', 'warn', MESSAGE, pagerOrLoadMore, missing.join('; '), 'range and total, Rows per page, Previous / Next')` exactly once.

**MESSAGE, verbatim:**
`List pagination shows the range and total ("1–25 of 128"), a Rows-per-page select and Previous / Next; record lists do not use Load more. A list that keeps another pager for a product reason (an API that pages by cursor only) writes the reason in DESIGN.md`

**Helpers:** each is a single regular expression or a small function over strings, with no DOM access. Match case-insensitively. Allow `.`, `,`, a space or a narrow no-break space as thousand separators, and `–`, `-` or ` to ` between the range numbers.

**Bookkeeping:** add `'pagination'` to `RULES` after `'table-above-fold'`. Add `checkPagination` to `CHECKS` after `checkTables`. Add the four helpers to `_internals`.

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `node --test tests/audit-internals.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the six fixture pages**

Each page uses `<meta name="audit-page-type" content="list">`, plus the `audit-expect` value given here. Keep 10 visible data rows from `list-clean.html` unless the entry says otherwise.

| File | `audit-expect` | Below the table |
|---|---|---|
| `list-pager-no-size.html` | `pagination` | `<p>1–10 of 57</p>` and a `<nav aria-label="Pagination">` with buttons `1 2 3 Next`. No select. |
| `list-load-more.html` | `pagination` | `<p>10 of 57</p>` and `<button>Load more</button>`. |
| `list-pager-clean.html` | (empty) | `1–25 of 1,284`, a `<label for=size>Rows per page</label><select id=size>` with 25, 50 and 100, and Previous and Next buttons. |
| `list-pager-clean-vi.html` | (empty) | `1–25 trên 1.284`, an unlabelled `<select aria-label="Số dòng mỗi trang">` with options `25 / trang`, `50 / trang` and `100 / trang`, and buttons `‹` (`aria-label="Trang trước"`) and `›` (`aria-label="Trang sau"`). Use `lang="vi-VN"`. |
| `list-pager-lookalikes.html` | (empty) | No pager. Above the table: a toolbar with buttons `1`, `2` and `Next`. In one cell: a link `Xem thêm`. In each row: an actions button. |
| `list-pager-loading.html` | (empty) | An empty `<tbody>`, an empty `<span id="range"></span>`, and Previous and Next buttons. |

All controls stay at least 24×24px with visible names, so that `target-size` and `icon-button-name` stay clean.

- [ ] **Step 6: Run the fixture tests**

Run: `node --test tests/audit-fixtures.test.mjs`
Expected: PASS for every fixture, old and new. If an old fixture now reports `pagination`, it has a pager. Fix the check, not the fixture, unless the fixture's pager really lacks a part. In that case, report it to the controller.

- [ ] **Step 7: Update the counts and the CHANGELOG, then run the docs tests**

1. In all three READMEs, change the rule count 22 → 23 in the badge and the tree line.
2. In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, write one entry. It covers:
   - the `pagination` rule (list pages, warn);
   - what it checks;
   - that "Load more" on a record list is flagged;
   - that a page without a pager is not measured.
3. Run: `node --test tests/repo-facts.test.mjs tests/adapters.test.mjs`
   Expected: PASS.

- [ ] **Step 8: Run the CLI tests and the consistency-eval tests, one after the other**

1. Run `node --test tests/audit-cli.test.mjs`. Expected: PASS. It audits every fixture through the CLI, the new ones included.
2. Then run `node --test tests/consistency-eval.test.mjs`. Expected: PASS. It takes about 4 minutes and does not pin audit scores.
3. Then run `node skills/enterprise-admin-ui/scripts/audit-cli.mjs tests/agent-eval/consistency/fixture/employees.html tests/agent-eval/consistency/fixture/timesheets.html tests/agent-eval/consistency/fixture/leave-requests.html --type list`.
4. Write which of the three pages report `pagination`, with the missing parts, in your report. Part 3 needs this.

- [ ] **Step 9: Commit**

```bash
git add skills/enterprise-admin-ui/scripts/audit.js tests/audit-internals.test.mjs tests/fixtures/list-pager-no-size.html tests/fixtures/list-load-more.html tests/fixtures/list-pager-clean.html tests/fixtures/list-pager-clean-vi.html tests/fixtures/list-pager-lookalikes.html tests/fixtures/list-pager-loading.html README.md README.vi.md README.zh-CN.md CHANGELOG.md
git commit -m "feat(audit): pagination rule for list pages"
```

### Task 2: Reference pagers pass the rule

**Files:**
- Modify: `tests/app/pages.mjs`. In `ordersPage`, the pager markup is at line ~316. The script's fixed `var SIZE = 20` at line ~63 is used by `renderPager` and `load`.
- Modify: `tests/app/server.mjs`, only if `/api/orders` ignores `size`. Check first.
- Modify: `tests/app.test.mjs`, adding a test.
- Modify: `tests/audit-fixtures.test.mjs`, adding a test for the shipped template.
- Modify: `CHANGELOG.md`, extending the existing "Dev only … `tests/app/`" entry by one clause.

**Interfaces:**
- Consumes: rule id `'pagination'` (Task 1).
- Produces: the orders list reads its page size from a `<select id="page-size">` with options 20, 50 and 100 (default 20). Changing it resets to page 1 and refetches. The workflow checks keep their current default page size of 20.

- [ ] **Step 1: Write the failing test for the dev app** in `tests/app.test.mjs`

`test('reference orders list: the pager passes the pagination rule and the page size changes the range')`:
1. Sign in as `lan`, open `/orders`, and wait until `#page-range` has text.
2. `page.addScriptTag({ path: AUDIT })`, then evaluate `enterpriseAdminAudit({ pageType: 'list' })`. Import `AUDIT` from `./fixture-pages.mjs`.
3. Assert that no violation has `rule === 'pagination'`.
4. Select `50` in `#page-size`. Assert that `#page-range` reads `1–50 of 60`.

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/app.test.mjs`
Expected: FAIL. The violations include `pagination` with `no page size`.

- [ ] **Step 3: Add the page-size select to the orders list**

- Put `<label for="page-size">Rows per page</label>` and `<select id="page-size">` (20, 50, 100) in `.pager`.
- Replace the fixed `SIZE` with state, and send `size` from it.
- A change resets `state.page` to 1, clears the selection the way a filter change does, and calls `load()`.

- [ ] **Step 4: Run the app tests and see them pass**

Run: `node --test tests/app.test.mjs`
Expected: PASS, including the existing workflow checks (`inputKept`, `permissionBoundary`, `selectAllMatching`).

- [ ] **Step 5: Write the template test** in `tests/audit-fixtures.test.mjs`

`test('shipped list template: the pager passes the pagination rule')`:
1. Route every request whose `url.hostname === 'cdn.tailwindcss.com'` (a URL predicate, not a glob) to an empty script (`route.fulfill({ contentType: 'text/javascript', body: '' })`), so the test runs offline. The pager is checked by structure and text, so it does not need styles.
2. Open `skills/enterprise-admin-ui/assets/templates/list.html` by file URL, and wait until `#page-range` has text.
3. Run `audit.js` with `pageType: 'list'`. Assert that no violation has `rule === 'pagination'`.
4. Assert `result.metrics.applicable.pagination === 1`, which proves the rule saw the pager.

- [ ] **Step 6: Run it**

Run: `node --test tests/audit-fixtures.test.mjs`
Expected: PASS. If it fails, the template's pager really lacks a part. Report it to the controller rather than changing the rule.

- [ ] **Step 7: Commit**

Extend the CHANGELOG's `tests/app/` entry to say that the reference orders list has a Rows-per-page select (20 · 50 · 100). Then:

```bash
git add tests/app/pages.mjs tests/app.test.mjs tests/audit-fixtures.test.mjs CHANGELOG.md
# plus tests/app/server.mjs only if it changed
git commit -m "test(audit): the list template and the reference app pass the pagination rule"
```

### Task 3: Shared-patterns guidance

**Files:**
- Modify: `skills/enterprise-admin-ui/SKILL.md`: Workflow lines 18–24, list recipe item 6 at line 45, Review mode step 2 at line 207, and the manual checklist at lines 218–226.
- Modify: `skills/enterprise-admin-ui/assets/DESIGN.template.md`: a new section after `## Components` (line 108).
- Modify: `skills/enterprise-admin-ui/references/filters-search.md`: the Filter bar anatomy rules (lines 28–33) and the Saved views and status tabs section (lines 60–68).
- Modify: `skills/enterprise-admin-ui/references/tables.md`: Pagination and large data (lines 87–95).
- Modify: `skills/enterprise-admin-ui/references/navigation-layout.md`: Breadcrumbs (lines 58–69).
- Modify: the adapters (regenerated), the README line counts and `CHANGELOG.md`.

**Interfaces:**
- Consumes: rule id `pagination` (Task 1), which the list recipe and the checklist name.
- Produces: the DESIGN.md section heading `## Shared patterns`, which SKILL.md and the references cite by that exact name.

- [ ] **Step 1: Edit the SKILL.md Workflow**

**Step 1 becomes:**
> **Read `DESIGN.md`** at the project root. If the project has no DESIGN.md and more than one screen, create it from `assets/DESIGN.template.md` before changing any screen, whatever the request is called (apply, improve, redesign). Fill product, roles, locale and status vocabulary from the user or the code. A single standalone file needs no DESIGN.md.

**Insert as step 2,** and renumber the later steps to 3–6:
> **Shared patterns:** when the task builds, redesigns or applies this skill to two or more screens:
> - List how each screen does pagination, the filter bar, the page header, status badges, dates and table rows.
> - Choose one implementation for each: DESIGN.md's Shared patterns, or its defaults.
> - Build each one once (one component, partial or shared script) and move every screen to it, behaviour included. A list with Load more gets the same pager as the others.
> - Keep a different pattern only when the product needs it (an API that pages by cursor only), and write the reason in DESIGN.md and the reply.
> - A task on one screen gives that screen the Shared patterns, lists the screens that still differ in DESIGN.md and offers to move them, and leaves them alone.

**List recipe item 6 becomes:** `Pagination: the app's one pager (DESIGN.md Shared patterns): range and total, Rows per page, Previous / Next. Not Load more.`

**Review mode step 2:** append `Compare the screens with each other: a shared pattern built differently on two screens is one \`layout\` finding that names both files.`

**Manual checklist:** add, as the first item, `- [ ] Every screen uses DESIGN.md's Shared patterns: the same pager, filter controls and page header; exceptions are written down`

- [ ] **Step 2: Add `## Shared patterns` to `DESIGN.template.md`, after `## Components`**

The section opens with this line:
> Every screen uses these. Build each once and reuse it. A screen that cannot follow one names the reason in the Decisions log.

Then comes a `| Pattern | This app |` table, with the rows and defaults copied verbatim from the spec, section "3. DESIGN.template.md":
- Pagination
- Filter bar
- Page header
- Status badge
- Dates and numbers
- Table rows
- Empty, loading, error

- [ ] **Step 3: Edit the three references**

- **`filters-search.md`, Filter bar rules.** Add this bullet:
  > One app, one filter bar: a filter that appears on several lists (Status, Date, Owner) uses the same control in the same place on all of them; status tabs on one list and a Status select on another read as two products. Record the choice in DESIGN.md's Shared patterns.
- **`filters-search.md`, Saved views and status tabs.** Add:
  > When one list has status tabs, every list with a status workflow has them.
- **`tables.md`, Pagination.**
  - The first bullet starts with `Every list of the app uses the same pager component (DESIGN.md Shared patterns).`
  - In the second bullet, replace "Show the page-size select above 50 rows" with `Every paged list shows the page-size select, so the pager is the same on every list`, and keep the "Go to page" jumper clause.
  - Rewrite the infinite-scroll bullet:
    > Record lists use the pager, not Load more or infinite scroll; those suit feeds (activity, notifications). A feed with infinite scroll shows "50 of 1.284 loaded" and restores the scroll position when the user returns from a detail page [NN/g].
- **`navigation-layout.md`, Breadcrumbs.** After the top-level list bullet (line 68), add:
  > Pages at the same level are treated alike: if one top-level list shows the module crumb, every top-level list does.

- [ ] **Step 4: Regenerate the adapters, update the line counts and the CHANGELOG, then test**

1. Run `npm run build:adapters`. The manual checklist is copied into the adapters.
2. Update the SKILL.md line count in the three READMEs (see Global Constraints).
3. In `CHANGELOG.md`, write the entries:
   - under `### Added`: the Shared patterns step, and the DESIGN.md section with its defaults;
   - under `### Changed`: DESIGN.md is created whatever the request is called; `tables.md` shows page size on every paged list; Load more and infinite scroll are only for feeds.
4. Run: `node --test tests/repo-facts.test.mjs tests/adapters.test.mjs`
   Expected: PASS.
5. Check that `git diff --stat main -- skills/enterprise-admin-ui/SKILL.md` shows that SKILL.md grew by 12 lines or fewer in this task.

- [ ] **Step 5: Commit**

```bash
git add skills/enterprise-admin-ui/SKILL.md skills/enterprise-admin-ui/assets/DESIGN.template.md skills/enterprise-admin-ui/references/filters-search.md skills/enterprise-admin-ui/references/tables.md skills/enterprise-admin-ui/references/navigation-layout.md adapters README.md README.vi.md README.zh-CN.md CHANGELOG.md
git commit -m "feat(skill): shared patterns step and DESIGN.md section; one pager and one filter bar per app"
```

### Task 4: Theme rule

**Files:**
- Modify: `skills/enterprise-admin-ui/SKILL.md`: Scope and precedence (line 14).
- Modify: `skills/enterprise-admin-ui/references/tokens.md`: add `## Replacing a template theme` after `## Mapping to existing design systems`, and add it to Contents.
- Modify: `skills/enterprise-admin-ui/references/anti-patterns.md`: the How to use list (lines 16–25).
- Modify: `README.md` lines 175 and 313, `README.vi.md` lines 175 and 316, `README.zh-CN.md` lines 175 and 316, plus the line counts and `CHANGELOG.md`.

**Interfaces:**
- Consumes: nothing from earlier tasks. It edits only SKILL.md's Scope section, which Task 3 leaves alone.
- Produces: nothing used by other tasks.

- [ ] **Step 1: Add the exception after SKILL.md:14**

Keep line 14. Add one bullet after it:
> - Exception, when the task applies this skill to the whole app, redesigns it or asks for a new look: theme values the project defines itself (CSS variables, the Tailwind config, a theme file) that are template tells (`references/anti-patterns.md`: dark sidebar, gradients, glass, card shadows, oversized radius, one colour per status) are replaced with the Foundations values where they are defined (`references/tokens.md`). Keep the accent and any colour DESIGN.md or the user names as the brand; library defaults and installed kits stay. The reply lists what was replaced and names an accent nobody declared, offering `#1d4ed8`.

- [ ] **Step 2: Write the `tokens.md` section `## Replacing a template theme`**

It covers:
- **When:** the SKILL.md exception.
- **Where each value lives:**
  - shadcn `globals.css`: `--radius`, the `--sidebar*` variables, and the card component's shadow classes;
  - the Tailwind config: `borderRadius`, `boxShadow`, `colors`;
  - plain CSS variables.
- **What it becomes:** the matching value from this file's `tokens.css` table and the Foundations.
- **The accent:** `--primary` and its pair stay. An undeclared accent is named in the reply with the `#1d4ed8` offer.
- **Done once, in the theme,** never as page-level overrides.

Keep it to about 20 lines.

- [ ] **Step 3: Add the line to `anti-patterns.md` How to use**

> In a project with its own theme, fix a tell where the theme defines it (a CSS variable, the Tailwind config, a shared component's classes), once, not on each page; SKILL.md Scope and precedence says when.

- [ ] **Step 4: Rewrite the README promises in all three languages**

The same meaning in each language:
- **Line 175:** the skill keeps your design system's components and tokens and applies the layout, state and behaviour rules. When you apply it to the whole app or ask for a redesign, it replaces template-tell values in a theme your project defines itself (dark sidebar, gradients, card shadows, oversized radius), keeps your accent and brand colours, and lists what it replaced.
- **FAQ "Will it fight my design system?":** No. A design system from a library or an internal kit always wins. A theme your project defines itself is kept too, except template-tell values, which the skill replaces only when you apply it to the whole app or ask for a redesign. It keeps your accent and lists what it changed. The existing `DESIGN.md` sentence stays.

- [ ] **Step 5: Update the line counts and the CHANGELOG, then test**

1. Update the SKILL.md line count in the three READMEs.
2. In `CHANGELOG.md`, under `### Changed`, add the theme exception: when it applies, what it replaces, and what it keeps.
3. Run `npm run build:adapters`. It should report no change, because Scope is not copied. Run it anyway.
4. Run: `node --test tests/repo-facts.test.mjs tests/adapters.test.mjs`
   Expected: PASS.
5. Check that SKILL.md has grown by about 15 lines or fewer in total since `main`.

- [ ] **Step 6: Commit**

```bash
git add skills/enterprise-admin-ui/SKILL.md skills/enterprise-admin-ui/references/tokens.md skills/enterprise-admin-ui/references/anti-patterns.md README.md README.vi.md README.zh-CN.md CHANGELOG.md
# plus adapters/ only if build:adapters changed it
git commit -m "feat(skill): replace a project theme's template-tell values when the skill is applied to the whole app"
```
