# Consistency and redesign baseline: the released skill (`bc0a566`)

Status: recorded 2026-11-22. This is part 1 of the consistency work: it measures only and changes nothing in the skill.

**Sources**
- Spec: `docs/superpowers/specs/2026-11-19-consistency-eval-design.md`
- Plan: `docs/superpowers/plans/2026-11-19-consistency-eval.md`
- Fixture: `tests/agent-eval/consistency/fixture/`, described in `FIXTURE.md`
- Runs: `tests/agent-eval/consistency/scenarios.md`
- Grader: `tests/agent-eval/consistency/grade.mjs`

## Summary

- **The skill removes every counted template tell, and the first screen changes a lot.**
  - In all four runs with the skill, every counted tell is gone (31 → 0), and every page audits at 100. The fixture's uncounted tells, such as oversized radii and card-in-card, show only in the screenshots.
  - Status colours, date format and table row height are the same on every page in all four runs.
  - In the first-screen pixel difference, every list and report page changed by 34–46%, and Settings by about 20%.
  - Without the skill, the same prompts leave 2 to 8 tells and change about 20%.
  - So a small change, as in the user's "it changed by maybe 10%", did not show on this fixture. The two numbers are different kinds of measure: the user's is an impression, and this one is a pixel count. We do not know the user's project or prompt. See "What this baseline cannot tell".
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

**Pixel difference with the skill, by page:**

| Page | First-screen change |
|---|---|
| list pages | 33.8–46.5% |
| reports | 34.9–38.1% |
| settings | 19.5–20.5% |

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

**Not weak on this fixture:** removing template tells, the audit score, status, date and row consistency, keeping functions, and the amount of visible change.

## What this baseline cannot tell

- **Why the user saw only about 10% change.**
  - We do not know the user's project, prompt or how they judged the change.
  - The fixture is plain HTML with inline styles and no component library or theme. SKILL.md's scope rule never applied: "If the project already has a design system or a customised component library…, keep its components and tokens".
  - In a real app built on an AI-made theme (for example, a customised shadcn theme), that rule would keep the theme. That is one possible cause of a small change, named in the spec. It is untested, and this fixture cannot test it.
  - A fixture variant with a shared theme or token file would be needed.
- **Behaviour on React or Next.js code.** The agents edited static pages and their inline scripts only.

## Caveats

- **The fixture and grader are self-built.**
  - The signatures are heuristics. Each one is unit-tested on the fixture and on equivalent-markup variants, but an unusual rewrite could still be misread.
  - The filter-bar signature reduces each page to one control kind, as described above.
- **The scale is small:** 6 runs, one model (sonnet), one fixture and two prompts.
- **The pixel difference covers the first screen only.** A change below 900px, such as a pager under a long table, does not count.
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
- **Screenshots:** the before-and-after first screens of the fixture, r01, r03, r05 and r06 are on a private Artifact page for the user. Running the grader again rebuilds every screenshot, under `<out>/screens/`.
