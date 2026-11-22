# Consistency and redesign baseline: the released skill (`bc0a566`)

Status: recorded 2026-11-22. This is part 1 of the consistency work: it measures only and changes nothing in the skill.

**Sources**
- Spec: `docs/superpowers/specs/2026-11-19-consistency-eval-design.md`
- Plan: `docs/superpowers/plans/2026-11-19-consistency-eval.md`
- Fixture: `tests/agent-eval/consistency/fixture/`, described in `FIXTURE.md`
- Runs: `tests/agent-eval/consistency/scenarios.md`
- Grader: `tests/agent-eval/consistency/grade.mjs`

## Summary

- **The skill removes every counted template tell. Outside the sidebar, it changes the screen no more than the runs without it.**
  - In all four runs with the skill, every counted tell is gone (31 → 0), and every page audits at 100. The fixture's uncounted tells, such as oversized radii and card-in-card, show only in the screenshots.
  - Status colours, date format and table row height are the same on every page in all four runs.
  - **Whole first screen:** the skill runs changed list and report pages by 34–46% and Settings by about 20%. Without the skill, the change was about 20%, and 6% on Settings.
  - **The whole gap is the sidebar.** Every skill run turned the navy sidebar light, and that band alone is 16.6 points of every page.
  - **Content area right of the sidebar:** the change is the same with and without the skill. It is 20–36% on list and report pages, and only 3.5–4.7% on Settings.
  - So this baseline does not contradict the user's "it changed by maybe 10%". The user's figure is an impression, and ours is a pixel count. We do not know the user's project or prompt. See "Pixel difference" and "What this baseline cannot tell".
- **The interaction patterns stayed different from page to page, which is the user's main complaint.**
  - In none of the 6 runs is pagination consistent, and in none is the filter bar consistent.
  - The agents restyled each page's pager, and in 5 of 6 runs kept each page's own pager mechanism:
    - numbered pages on Employees;
    - Prev/Next with a page size on Timesheets;
    - "Load more" on Leave requests.
  - This happened even though SKILL.md's list layout asks for "Pagination with page size and total" on every list. The audit does not check pagination, so it still scores those pages 100.
- **No run had a shared-pattern step.**
  - Two of the four skill runs wrote a `DESIGN.md`, and neither recorded a pagination, filter bar or page header pattern. `DESIGN.template.md`'s Components section is one generic line.
  - The two "Redesign" runs (P2) skipped `DESIGN.md` entirely, although SKILL.md's workflow step 1 asks for it whenever a project has more than one screen.

## Setup

**The fixture** is an AI-made attendance admin with five pages: `employees`, `timesheets`, `leave-requests`, `reports` and `settings`.
- Each of six patterns is implemented differently on every page that has it: pagination, filter bar, page header, status badge, date format and table row.
- The pages carry 31 counted template tells between them.
- It has no `DESIGN.md`.

**The released skill** is `git archive bc0a566 skills/enterprise-admin-ui`, copied outside the repo.

**The prompts** follow the R3 run template, with each run in its own folder (see `scenarios.md`):
- P1, with the skill: "Apply the enterprise-admin-ui skill to this app."
- P1, without the skill: "Improve this app's UI."
- P2, for both: "Redesign this attendance admin so it looks professional and consistent."

**Grading** runs `grade.mjs <fixture> <run>/app` once per run. It measures:
- **Consistency:** a pattern counts as consistent when every page that has it produces the same signature.
- **Audit:** `audit-cli --json` with the fixed page types.
- **Counted tells:** the five audit tell rules, `table-above-fold` on list pages, and the detectors `greeting-header`, `rainbow-status` and `initials-avatar-non-person`.
- **Pixel difference:** on the 1440×900 first screen, counting pixels whose RGB distance is above 32.
- **Function kept:** the page loads and audits, shows data rows or labelled fields, and its search narrows on the known name.

The fixture graded against itself gives 0/6, the planned tells and 0% difference; this is a test in the suite.

## Results

| Run | Skill, prompt | Consistency | Mean audit | Tells | Median diff % (min–max) | Function kept | Consistent patterns |
|---|---|---|---|---|---|---|---|
| r01 | released, P1 | 0/6 → 3/6 | 20 → 100 | 31 → 0 | 36.31 (19.51–44.09) | 5/5 | statusBadge, dateFormat, tableRow |
| r02 | released, P1 | 0/6 → 4/6 | 20 → 100 | 31 → 0 | 37.24 (20.53–46.48) | 5/5 | pageHeader, statusBadge, dateFormat, tableRow |
| r03 | released, P2 | 0/6 → 4/6 | 20 → 100 | 31 → 0 | 34.91 (19.55–43.69) | 5/5 | pageHeader, statusBadge, dateFormat, tableRow |
| r04 | released, P2 | 0/6 → 4/6 | 20 → 100 | 31 → 0 | 35.5 (19.59–43.62) | 5/5 | pageHeader, statusBadge, dateFormat, tableRow |
| r05 | none, P1 | 0/6 → 1/6 | 20 → 80.8 | 31 → 2 | 19.46 (6.06–30.95) | 5/5 | statusBadge |
| r06 | none, P2 | 0/6 → 2/6 | 20 → 76.4 | 31 → 8 | 20.13 (5.45–31.38) | 5/5 | pageHeader, statusBadge |

**Per-page audit before the runs:**

| Page | Score |
|---|---|
| employees | 10 |
| timesheets | 0 |
| leave-requests | 0 |
| reports | 38 |
| settings | 52 |

**Per-page audit after the runs:**
- With the skill, every page scores 100 in all four runs.
- Without the skill, the pages score 56–100 (r05) and 60–90 (r06).

### Pixel difference

The grader reports the whole 1440×900 first screen. For this table, the same screenshots were split at x = 240, the sidebar's width.

| Page | Whole screen, skill | Content area, skill | Content area, no skill |
|---|---|---|---|
| employees | 43.6–46.5% | 32.4–35.8% | 34.6–35.5% |
| timesheets | 35.5–37.1% | 22.7–24.5% | 22.3–23.4% |
| leave-requests | 33.8–37.3% | 20.6–24.8% | 20.5–21.7% |
| reports | 34.9–38.1% | 21.9–25.7% | 19.7–19.9% |
| settings | 19.5–20.5% | 3.5–4.7% | 4.0–4.1% |

- **The sidebar band** adds 16.6 points to every page in the skill runs, and about 2 points without the skill.
- **The content-area figures** are percentages of the content area (1200×900).
- **How to read these numbers:**
  - The metric counts layout shifts as change.
  - It undercounts light-on-light restyling below its RGB threshold of 32. The Settings form was visibly restyled in every run but scores under 5%.
  - Read the numbers with the screenshots, not instead of them.

## What stayed inconsistent

These are the grader's signatures after each run, read from the rendered pages and checked against the markup.

### Pagination: 0 of 6 runs consistent

| Run | employees | timesheets | leave-requests |
|---|---|---|---|
| r01 | numbered, range text | Prev/Next, page size, range text | load more |
| r02 | numbered, page size, range text | Prev/Next, page size, range text | Prev/Next, page size, range text |
| r03 | numbered, range text | Prev/Next, page size, range text | load more |
| r04 | numbered, range text | Prev/Next, page size, range text | load more |
| r05 | numbered, range text | Prev/Next, page size | load more |
| r06 | numbered, range text | Prev/Next, page size | load more |

Every pager sits below its table.

**With the skill:**
- The four runs gave every pager the same visual style, and added range text ("Hiển thị x–y trên N") on Employees and Timesheets.
- On Leave requests, r01, r03 and r04 added a count beside "Load more" ("N trên M đơn"). The grader's range-text pattern needs the x–y form, so the table does not list it.
- They kept each page's mechanism. Only r02 replaced "Load more", and even r02 left Employees with numbered pages.

**Without the skill:** r06 said why it stopped: "Unifying that would mean changing the scripts."

### Filter bar: 0 of 6 runs consistent

- On the three list pages, the search box is on the left in every run. Reports and Settings have no search box.
- The control kind differs from page to page:
  - Employees and Reports filter with selects.
  - Leave requests filters its status with tabs or chips. Status tabs are a pattern SKILL.md offers. Its markup has no select in five runs; r02 adds a type select and a page-size select.
  - Timesheets has a "More filters" panel button in r02, r03, r05 and r06. r01 and r04 replaced the fixture's panel with inline selects.
- So the same filter, status, is a select on one page and tabs on another.
- The agents did change some filter mechanisms (panel to inline selects; status buttons to tabs), but not towards one shared filter bar.
- **Grader note:** the grader reduces the filter area to one kind per page, in the order panel button, then chips or tabs, then select. This explains the labels, but the underlying difference is real: in five of the six runs the markup has no select on Leave requests.

### Page header: consistent in 3 of 4 skill runs

- r01 kept the fixture's breadcrumbs on two pages only: Leave requests and Reports.
- r05, without the skill, did the same.
- The consistent runs got there in two ways. r02 and r03 removed breadcrumbs from every page, and r04 (and r06) added them to every page.
- All runs unified the h1 size and put the primary action on the right.

### Status badge, date format, table row: consistent in all four skill runs

- **Skill runs:**
  - Rows are 40px with 14px text on every page.
  - Dates are dd/mm/yyyy.
  - One status tone set is used across all pages.
- **Without the skill:**
  - Both runs unified status colours.
  - Both kept three date formats: dd/mm/yyyy, ISO and "Nov 3".
  - Row heights differed across pages, from 44 to 64px.

## Tells that remained

- **With the skill:** none, in all four runs.
- **Without the skill:**
  - r05: `initials-avatar-non-person` on Leave requests and Reports.
  - r06: `emoji-icon` on all five pages, `rainbow-status` on Timesheets, and `initials-avatar-non-person` on Leave requests and Reports.

## What was weak, in order

This is the input to part 2.

The order follows how directly each point explains the user's main complaint (the same function designed differently on different pages), then how many skill runs it affected. Points 2 and 3 are the specific forms that point 1 took on this fixture.

1. **Shared interaction patterns are not unified across pages.**
   - Pagination was inconsistent in 4 of 4 skill runs, and filter controls in 4 of 4.
   - The agents mostly kept each page's pager mechanism and restyled around it. r06 gave the reason: "Unifying that would mean changing the scripts."
   - The skill has no step that says: "inventory the patterns the pages share, pick one implementation for each, and move every page to it, behaviour included."
   - The audit checks each page alone, and `audit.js` has no pagination rule, so nothing flags the gap.
2. **The skill's own list rule was not applied to existing pagers.**
   - SKILL.md's list layout, item 6, asks for "Pagination with page size and total". Read as a visible page-size control plus range text, r02 met it on all three list pages, and it was the only one of the four runs to do so.
   - The other three runs met it on Timesheets only. Employees has range text but no page-size control, and Leave requests has "Load more" with a count.
3. **The skill offers alternatives with no "choose once per app" rule.**
   - Status tabs versus a status select, and an inline filter versus a "More filters" panel, are both valid in SKILL.md and `filters-search.md`.
   - Nothing says that the same filter must use the same control on every page of an app.
4. **`DESIGN.md` does not carry shared patterns, and the P2 runs skipped it.**
   - The two P1 runs wrote one with locale, status vocabulary and navigation, but no components.
   - The template's Components section is one generic line.
   - The two "Redesign…" runs wrote no `DESIGN.md`, although workflow step 1 asks for one when a project has no DESIGN.md and more than one screen.
5. **No run compared the pages by eye.**
   - None of the six agents reported looking at the rendered pages or clicking through them.
   - The four skill runs ran `audit-cli`. It renders each page but reports scores, not pictures, and by design it cannot see differences between pages. They took its 100 as the finish line.

**On the second complaint, the small change:**
- Beyond the shell, the skill runs changed the screen as much as a plain "Improve this app's UI" prompt, and no more.
- On the form page, they changed under 5% of the content area's pixels.
- This is consistent with the user's impression. It does not show whether more change was needed, so the screenshots are the better guide.
- Part 2 should not treat "more pixels changed" as a goal in itself.

**Not weak on this fixture:**
- removing template tells;
- the audit score;
- status, date and row consistency;
- keeping functions.

## What this baseline cannot tell

- **Why the user saw only about 10% change.**
  - We do not know the user's project, prompt or how they judged the change.
  - On this fixture, the content area changed about as much with the skill as without it, and under 5% on the form page. That fits the impression but does not explain it.
  - The fixture is plain HTML with inline styles and no component library or theme. SKILL.md's scope rule never applied: "If the project already has a design system or a customised component library…, keep its components and tokens".
  - In a real app built on an AI-made theme (for example, a customised shadcn theme), that rule would keep the theme. That is one possible cause of a small change, named in the spec. It is untested, and this fixture cannot test it.
  - A fixture variant with a shared theme or token file would be needed.
- **Behaviour on React or Next.js code.** The agents edited static pages and their inline scripts only.

## Caveats

- **The fixture and grader are self-built.**
  - The signatures are heuristics. Each one is unit-tested on the fixture and on equivalent-markup variants, but an unusual rewrite could still be misread.
  - The filter-bar signature reduces each page to one control kind, as described above.
- **The scale is small:** 6 runs, one model (sonnet), one fixture and two prompts.
- **The pixel difference covers the first screen only.** A change below 900px, such as a pager under a long table, does not count. The sidebar dominates its differences between conditions, as described under "Pixel difference".
- **Function kept is a narrow check.**
  - It covers only these things: the page loads and audits, it shows data rows or labelled fields, and its search narrows on the known name.
  - Approve, reject, export and saving settings were not exercised.
- **Isolation was weaker than planned.**
  - The run agents share the session's scratch folder, and their own instructions tell them to keep temp files there.
  - Several runs wrote helper scripts outside their app folder:
    - r01: `c/tpl`;
    - r04: a `build.py` in the scratch root;
    - r05: `xform2.py` and `xform3.py`, which name its folder;
    - r03, judging by the script's content: a `tpl/build.py` in the scratch root;
    - r02: a `work` folder in its own parent, seen during the run and gone by the end.
  - No file was shared or overwritten between runs, but a run could have listed another run's helpers.
  - Part 3 should run from a temporary root outside the session's scratch folder.
- **The runs overlapped in time** and could each start their own `audit-cli` browser. This was not observed to affect any run.

## Grader limits to fix before part 3

The final review probed the grader with synthetic pages. None of these limits changes this baseline: all 18 list pages had their pager found, no run used a remote resource, and every search box was found. They would matter when part 3 re-measures changed skill output.

- **Pager outside its block.**
  - A pager that sits beside the table's block inside `<main>` is not found. One example is a Bootstrap `.table-responsive` followed by `<nav class="pagination">`.
  - The result is a false "pattern lost: pagination", and the page drops out of the pagination comparison.
- **Filter bar reduced to one kind.**
  - Two pages can read as the same pattern while being different. For example, search plus selects plus a "Filters" button, against search plus tabs plus the same button: both read as `panel-button`.
  - The signature should be the set of control kinds, as pagination already uses.
- **Search found only by the audit's selector.** A visible `<label>Tìm kiếm</label>` on a plain text input is missed.
- **A one-page numbered pager.** It shows only "1", so it reads differently from the same pager with several pages.
- **Remote requests are fulfilled through Node without a record.** Output that uses a CDN could grade differently online and offline.
- **The pixel difference is reported for the whole screen only.** Report the shell and the content area separately.
- **`report.json` has no grader version.**

## Data

- `tests/agent-eval/consistency/baseline/rNN/` keeps each run's data:
  - `app/`, the output folder;
  - `report.json`, graded with `grade.mjs` at commit `6db48a3`;
  - `reply.md`, the controller's summary of the agent's final reply.
- Running the grader on the fixture and `app/` rebuilds the screenshots.

## Run log

| Run | Time | Tool uses | Notes |
|---|---|---|---|
| r01 | 505 s | 23 | `DESIGN.md`, `app.css`, `app.js`; pages generated by a template script; skeleton on first load |
| r02 | 468 s | 25 | `DESIGN.md`, `admin.css`, `admin.js`; skeleton for about 250 ms; reject dialog requires a reason |
| r03 | 420 s | 16 | `app.css`, `app.js`; audit 100 after fixing a failing export check |
| r04 | 397 s | 13 | `app.css`, `app.js`; build script outside the app folder |
| r05 | 206 s | 13 | `styles.css` |
| r06 | 176 s | 10 | `styles.css`; left pagination alone on purpose |

- Times and tool-use counts come from each agent's completion record.
- No run needed a re-run.
- Each grading run took 32–36 s.
- **Screenshots:** the before-and-after first screens of the fixture, r01, r03, r05 and r06 are on a private Artifact page for the user. Running the grader again on `baseline/rNN/app` rebuilds every screenshot, under `<out>/screens/`.
