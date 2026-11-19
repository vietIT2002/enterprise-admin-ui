# Multi-page consistency and redesign evaluation (part 1: measure the current skill)

Status: proposed, 2026-11-19. Project-sized. Part 2 (changing the skill) and part 3 (re-measuring) get their own designs, built on what this one finds.

## Why

The user reports feedback from people using the skill, but has no case we can reproduce:
- "The same function is designed differently on different pages. Pagination looks one way here and another way there, and other features are the same."
- "My attendance admin looked very AI-made without the skill. With the skill added, it changed by maybe 10%."
- "The skill is not strong enough for me to use."

Reading the skill suggests three causes:
- **No shared-pattern step.** The skill works screen by screen. `DESIGN.template.md`'s Components section is one generic line, nothing tells the agent to build shared components once and reuse them, and the audit checks pages one at a time.
- **No redesign mode.** SKILL.md:14 keeps a project's existing components and tokens, which preserves an AI-made theme. There is a Review mode (report only) and a build workflow, but no mode for moving an existing app to the skill's standard.
- **Our measurements cannot see either problem.** Every benchmark and A/B so far grades one page at a time. None measures whether pages agree with each other, or how much an existing app changes.

Part 1 builds a measurement that can see these problems, and records how the released skill does on it. Part 2 then changes only what the numbers show is weak. This is the lesson of R3, where the baseline showed that half the planned changes were not needed.

## Goals

- **A fixture app** that looks AI-made: an attendance admin with five pages. The pages implement the same patterns in different ways on purpose, and carry the template tells listed in `references/anti-patterns.md`.
- **A grader** that measures, offline, from the files an agent leaves behind:
  - **Consistency:** for each shared pattern, whether every page that has it implements it the same way.
  - **Change:** for each page, the audit score and the number of template tells, before and after; and how much of the rendered page changed, as a pixel difference.
  - **Function kept:** each page still loads with no audit setup error, and still shows its data.
- **Scenarios:** two prompts in the user's words.
  - P1: "Apply the enterprise-admin-ui skill to this app."
  - P2: "Redesign this attendance admin so it looks professional and consistent."
  - Agents run in isolated copies, the same way as R3.
- **A baseline report** for the released skill: two runs per prompt, plus one run per prompt without the skill for calibration. The report has numbers, before-and-after screenshots, and a short reading of what was weak. It is published as a page the user can look at.

## Non-goals

- Changing the skill. That is part 2.
- A React or Next.js fixture. Part 1 uses plain HTML pages, so the grader runs offline in seconds and agents need no `npm install`. A React fixture can come later, if part 2's changes are framework-specific.
- Human design-quality scoring beyond the screenshots. The user looks at the screenshots; no blind panel.

## Approaches considered

1. **Chosen: measure first, with a self-built AI-made multi-page app.** There is no real case. The fixture is built to contain the reported failures (different patterns per page, AI-made look), so a weak skill shows up as numbers.
2. **Change the skill first, then measure.** Faster, but repeats the R3 risk of changing what is not broken. Rejected by the user.
3. **Measure on single pages, as before.** It cannot see cross-page consistency, which is the main complaint.

## Design

### Fixture: `tests/agent-eval/consistency/fixture/`

**Five HTML pages.** Each is a self-contained file with inline CSS and an inline script with mock data. There is no CDN, so the grader works offline.

| Page | Purpose |
|---|---|
| `employees.html` | List of 48 employees |
| `timesheets.html` | List of daily attendance records for 120 rows, with filters by date and department |
| `leave-requests.html` | List of 36 requests with statuses, plus Approve/Reject actions |
| `reports.html` | Monthly summary table |
| `settings.html` | Form for the work schedule |

**Mock data** is fixed: Vietnamese names, departments, `vi-VN` dates.

**The inconsistencies are deliberate.** Each pattern is different on every page that uses it:

| Pattern | The variations |
|---|---|
| Pagination | numbered buttons; "Load more"; Prev/Next only; a page-size select with no range text; none on `reports.html` (its 12 rows fit one page) |
| Filter bar | search on the left vs the right; selects vs chips; a "Filter" button that opens a panel |
| Page header | title with the primary action on the right; title with the action below it; a breadcrumb on some pages only |
| Status badges | a different colour set per page for the same statuses |
| Dates | `dd/mm/yyyy` on one page, `yyyy-mm-dd` on another, "Nov 3" on a third |
| Empty state | text only on one page; an illustration plus a button on another |

**The template tells** come from `anti-patterns.md`:
- `greeting-header`, `kpi-strip-above-table`, `kpi-icon-tiles`, `gradient`, `card-shadow`, `card-in-card`, `oversized-radius`, `tracked-uppercase-labels`, `emoji-icon`, `rainbow-status`, `navy-sidebar-indigo-accent`, `initials-avatar-non-person`, `stacked-table-rows`.
- Each tell appears on at least two pages, and none of the pages is clean.

**Everything works.** Each page is functional: search filters its rows, pagination pages, and Approve changes a status. This makes "function kept" measurable.

**The fixture has no `DESIGN.md`.** That is the situation the user reported.

### Grader: `tests/agent-eval/consistency/grade.mjs`

Run it as `node grade.mjs <before-dir> <after-dir> [--out report.json]`. It uses Playwright, which is already a devDependency, and `audit-cli.mjs`.

**Consistency.**
- For each page, the grader extracts a **signature** of each pattern from the rendered DOM, after load and settle. The rules are below.
- A pattern is **consistent** when every page that has it produces the same signature.
- The score is the number of consistent patterns out of the patterns present on two or more pages. The report also lists each page's signature, so a reader can see which page differs.

| Pattern | Signature |
|---|---|
| **Pagination** | The sorted set of:<br>• its control kinds: `numbered`, `prev-next`, `load-more`, `page-size-select`, `range-text` (matching `/\d+[–-]\d+ (of\|trên\|\/) \d+/`);<br>• its position relative to the table: `below` or `above`. |
| **Filter bar** | • whether a search box exists, and its side (`left`/`right`, by x-centre relative to the table's centre);<br>• the filter control kind: `select`, `chips` or `panel-button`. |
| **Page header** | • the h1's tag and font size;<br>• the primary action's position (`header-right`, `below-title` or `none`);<br>• whether there is a breadcrumb. |
| **Status badge** | A map from each status text to its computed background colour, rounded. A page agrees with another when the statuses they share have the same colour. |
| **Date format** | The format class of every date-like text in table cells: `dd/mm/yyyy`, `iso` or `month-name`. |
| **Table row** | The rendered body row height, in buckets of 4px, and the body font size. |

**Change.**
- For each page, `audit-cli --json --type <type>` runs on the before and after versions. The grader records the score, the error and warning counts, and how many of the audit's tell rules fire: `no-gradient`, `no-backdrop-blur`, `surface-shadow`, `uppercase-text`, `emoji-icon`.
- For each page it also takes a full-page screenshot of both versions at 1440×900, and computes the **pixel difference**: the percentage of pixels whose RGB distance is above a threshold. This runs in the page through `canvas`, so no image library is needed. It answers the user's "changed by maybe 10%" with a number.

**Function kept.** For each page in the after version:
- it loads with no audit error;
- it shows at least one data row, or the form;
- its search narrows the rows when there is a search box.

**Output.** JSON with everything above, the screenshots as PNG files, and a summary table.

### Scenarios and runs: `tests/agent-eval/consistency/scenarios.md`

- The run prompt template follows R3's, with the same isolation rules:
  - every run gets its own parent directory outside the repo, with neutral names;
  - the skill copy also lives outside the repo;
  - the model is sonnet for every run;
  - the prompt is the same for every run except the paths.
- The "without skill" runs get the same prompt with the skill sentence removed.
- **Baseline matrix**, 6 runs:

  | Prompt | Released skill (`main` `bc0a566`) | Without skill |
  |---|---|---|
  | P1 | 2 runs | 1 run |
  | P2 | 2 runs | 1 run |

### Report

- `docs/superpowers/evals/2026-11-xx-consistency-baseline.md`, plus a published Artifact page with the before-and-after screenshots side by side for each page.
- It contains:
  - the consistency score per run;
  - the audit and tell changes;
  - the pixel difference per page;
  - function kept;
  - a section on what was weak, which names the patterns that stayed inconsistent and the tells that stayed.
- Caveats: a self-built fixture, plain HTML, a few runs, and one model.

## Decisions after the builder check (2026-11-19)

1. **Pairing and restructured output.**
   - Before and after pages are paired by filename.
   - A fixture page missing from the after folder is reported as "page missing" in function kept, and drops out of consistency and change.
   - Extra files the agent adds, such as a shared CSS or JS file in the same folder, are allowed and load normally.
   - Consistency for a pattern is computed over the pages where that pattern is present after.
   - A list page that had pagination or search before, and has neither after, is reported as "pattern lost", a function-kept failure.
   - The signature heuristics must recognise equivalent markup:
     - icon-only Prev/Next found by accessible name;
     - chips built as buttons, links, or `role="tablist"`/`tab`;
     - range text anywhere within the table's container.
2. **What counts as a tell.**
   - The grader counts:
     - the audit's rules (`no-gradient`, `no-backdrop-blur`, `surface-shadow`, `uppercase-text`, `emoji-icon`);
     - `table-above-fold` on list pages, for the KPI strip;
     - three grader detectors:
       - `greeting-header`: an h1 or h2 whose text matches a greeting such as "Welcome", "Chào" or "Good morning";
       - `rainbow-status`: 5 or more distinct badge hues on one page;
       - `initials-avatar-non-person`: a 1–2 letter circular element in a row whose first column is not a person.
   - The other tells are in the fixture for realism, and show only in the screenshots.
   - "The planned tells" in Done when means the counted ones.
3. **Page types are fixed** before and after:
   - `employees`, `timesheets` and `leave-requests` are `list`;
   - `reports` is `report`;
   - `settings` is `settings`.
4. **Agent runs** are done by the controller with the Agent tool on sonnet, as in R3. The replies and output folders are recorded. A run that produces no usable output is re-run once, and both attempts are recorded. There is no run script.
5. **Function kept, exactly:**
   - the page loads with no audit error;
   - list and report pages show at least one data row;
   - `settings` shows at least 3 labelled fields;
   - if a search box exists after (the audit's selector, `role="searchbox"`, or a label or placeholder containing "search" or "tìm"), typing the fixture's known name narrows the rows.
6. **Pixel difference.**
   - The fixture uses no `Date.now`, randomness, animation or relative dates.
   - The diff is computed on the 1440×900 first screen only, so page height does not matter.
   - Images are compared through data URLs.
   - Full-page screenshots are kept for the report only.
7. **The released skill** is `git archive bc0a566 skills/enterprise-admin-ui`.
8. **Artifact page.**
   - One representative run per prompt and condition: P1 and P2, each with the released skill and without it, beside the fixture.
   - Five pages, using the first-screen images, scaled down and compressed to keep the page small.
   - The page is published privately. The user decides whether to share it.

## Builder's calls

- The pages' exact markup and copy, within the inconsistency and tell lists above.
- The DOM heuristics for each signature, within the definitions above. Each heuristic must be unit-tested on the fixture itself: run on the fixture, it must report the planned inconsistencies, and the expected values go in a test.
- The pixel-difference threshold. Use a fixed RGB distance, and document it.
- How the Artifact page is laid out.

## Done when

- The grader, run on the fixture against itself, reports consistency 0 of N for the planned patterns, the planned tells, and 0% pixel difference. A test checks this.
- The grader, run on the fixture against a hand-fixed copy of two pages (made in the test), reports the change. This proves it can see an improvement.
- The baseline matrix has been run, and the report and screenshots page are published.
- `npm test` passes, run alone. The grader's tests are in the suite, and the agent runs are not.
- `audit.js` and `SKILL.md` are unchanged.
- No commit or PR text carries Claude or Claude Code attribution.
