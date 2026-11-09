# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `audit-cli.mjs --checks` uses the page the way a person would and checks the behaviour SKILL.md asks for:
  - a search that matches nothing empties the list and says so, and on a list the count changes;
  - Export names its count;
  - Print hides the navigation and buttons and keeps the title;
  - Delete opens a dialog first (the browser's `confirm()` also counts);
  - a `role="status"` region exists.

  It needs no special markup and no dependencies, and it skips a check when the page has no control for it. It replaces `scripts/check.mjs`, which was never in a release: that script needed Playwright and `data-*` attributes, and its state checks are covered by `--states`.
- Optional page templates in `assets/templates/` (`list.html`, `detail.html`, `form.html`). As shipped, each passes the audit and `--checks`, and the list and detail templates also pass `--states`.
- SKILL.md lists the templates as optional. A workflow that made agents start from a template and loop on a checker until it passed was measured on 12 blind-reviewed pages:
  - the checklist reached 39%, against 38% for v0.5.8;
  - the audit score rose from 88 to 100;
  - cost rose 1.65×.

  It is not part of the workflow (benchmark SCREEN-A).

### Fixed
- `audit-cli.mjs --states` no longer counts label–value rows as data rows. Such a row is a row header with one value ("Customer | Minh Phat"), so a detail page whose related lists are empty now passes `?state=empty`.

### Docs
- Benchmark COMPARE: on the 12 independent briefs, reviewed blind, enterprise-admin-ui passed 44% of the acceptance checklist, ui-ux-pro-max 30%, impeccable 19%, frontend-design 18% and no skill 19%. The READMEs report it under "How it compares", with the caveats.
- READMEs open with the problems the skill fixes:
  - tables with only a search box;
  - forms that lose input when saving fails;
  - deleting without a confirmation;
  - missing loading and error states.

  Then comes a "See it · Install · Try a prompt" row, and the measured result with numbers by theme (states 12% → 59%, search/filters/counts 16% → 54%, confirmations 25% → 63%). The install flags moved into a collapsed section.
- New README image: the same orders page from the same prompt and the same data (English, USD), without and with the skill. Each moment is cropped from the real pages: the first screen, a search with no results, and deleting an order.
- Results now separate two questions:
  - **"Does the page do what the screen needs?"**: the independent checklist, 19% → 44%;
  - **"Does it follow the skill's own rules?"**: the audit, median 69 → 90.

  A page can score 100 on the audit and still miss requirements. The earlier, author-written measurements moved into a collapsed section that says why they look higher.

## [0.5.10] — 2026-11-09

### Added
- `audit-cli.mjs --states` checks the states SKILL.md asks a page with mock data to show. After the page itself, it opens `?state=empty`, `?state=error` and `?state=loading`, and each must change the page:
  - empty: no data rows remain, and the state has an action of its own, such as "Create order" or "Clear filters";
  - error: a visible `role="alert"` message, and a Retry action (Retry, Try again, Thử lại, 重试);
  - loading: a skeleton (`aria-busy="true"` or `animate-pulse`), not only a spinner.

  A state that fails prints ✗ and exits 1. The score stays as the benchmark measures it.
- `audit-cli.mjs --timeout <s>` (default 90) limits each page and each state. A page that takes longer is reported, the browser is stopped and a new one audits the next page, so a browser that stops answering can no longer keep a run going for minutes.

## [0.5.9] — 2026-11-08

### Added
- `scripts/audit-cli.mjs` runs the audit from a terminal, with no dependencies: `node <skill folder>/scripts/audit-cli.mjs <url | file.html>... --type list`. It opens each page in an installed headless Chrome, Edge or Chromium the way the benchmark does: a light colour scheme on a 1440×900 screen, network idle, then the benchmark's settle. It prints the score, or JSON with `--json`. It exits 1 on an ✗ error (on any violation with `--strict`) and 2 when a page cannot be audited: a missing file, a refused connection or a server that never answers, an HTTP error, a script that never yields, a Tailwind CDN that did not load, or no browser. It dismisses dialogs, and it runs when the skill folder is a link. Each page gets its own storage and cookies. Ctrl+C removes the temporary browser profile, and the next run removes profiles that a killed run left. A folder, or a URL written without `http://`, gets a clear message. SKILL.md Verify, the review steps in `anti-patterns.md` and the READMEs lead with it.
- Tests and CI. `npm test` runs:
  - unit tests for the DOM-free helpers in `audit.js`;
  - `audit.js` in Chromium on the pages in `tests/fixtures/`. Each page declares the rules it must fail, every rule fails on at least one page, and the clean pages must score 100;
  - a check that `adapters/` matches `SKILL.md`. The snippets are now built by `tools/build-adapters.mjs` (`npm run build:adapters`);
  - a check that the numbers and names in the three READMEs, the plugin manifests and `CHANGELOG.md` match the files.
- GitHub Actions runs the tests on every push to `main` and every pull request, and failures show as annotations. The READMEs show the CI status.
- `CONTRIBUTING.md`: setup, what the tests check, and how to change `SKILL.md`, `audit.js` and the references.

### Fixed
- `audit.js` 0.5.2 no longer checks a bare integer of four or more digits as a number, so a year (`2026`) or an ID (`1043`) can stay left-aligned, as `tables.md` asks. Before, a left-aligned ID or year column failed `numeric-align` and `tabular-nums`. Where the page's `lang` leaves 1000 ungrouped (es-ES, pl-PL write `1500`), the limit is five digits.
- SKILL.md Verify and the `audit.js` header list the page types for reports, printable documents, calendars, boards and trees (`report`, `document`, `calendar`, `board`, `tree`). Before, they named only the six older types, so agents ran these screens with no page type or as `list`.
- `calendars.md`: `weekSegments` takes the number of week rows (default 6) and stops at the last one. Before, an entry that ran past the grid returned bars for rows that are not shown.
- `audit.js` no longer carries a leftover development comment.

### Docs
- README install gives separate commands for macOS/Linux and Windows. On Windows it uses `npx.cmd`, because PowerShell's default policy blocks `npx.ps1`, and `--copy`. It also lists the `-a`, `-y` and `-g` flags and manual `git clone` commands for both systems, and notes that the `skills` CLI needs Node.js 22.20 or later.
- README "Use it in your project": what to type in Claude Code, Codex, Cursor and GitHub Copilot, with example requests for building and reviewing.
- Benchmark HELDOUT3: six briefs written by an agent that never read the skill, reviewed blind. The checklist pass rate went from 22% without the skill to 48% with v0.5.8: from 16% to 58% on UI behaviour, and from 30% to 35% on domain rules the prompts did not state. README reports it as the fairest number.
- In the [benchmark repository](https://github.com/vietIT2002/enterprise-admin-ui-benchmark), `benchmark/tools/bench.mjs --blind` reviews coded pages in neutral folders and keeps the key next to the runs.
- Benchmark HELDOUT4: six more independent briefs, reviewed blind. v0.5.8 went from 15% without the skill to 39%; over the 12 screens of HELDOUT3 and HELDOUT4, from 19% to 44%. README now reports this pooled number: 14% to 51% on UI behaviour, and 26% to 33% on domain rules the prompts did not state.
- A tested candidate was reverted and is not in any release. It added a domain-rules step, references named in every recipe and a check-before-finish pass. Over two runs it scored 40% against 38% for v0.5.8, with UI behaviour the same, cost 1.41× per page, and wrote all 12 of its pages to the wrong folder.
- Benchmark tools, in `benchmark/tools/` of the benchmark repository:
  - `blind-review.mjs` reviews several run folders in one blind pool, optionally only some runs;
  - `bench.mjs` recovers pages written to a sibling folder;
  - a later session adds to `bench-usage.json` instead of replacing it.

## [0.5.8] — 2026-11-06

### Added
- Four references for new screen types, each written from the gaps measured on new briefs:
  - `reports-print.md`: reports with periods, named comparisons and totals, and printable documents with a print stylesheet;
  - `calendars.md`: the locale's week start, multi-day bars, daily coverage, a keyboard grid and a list view;
  - `boards.md`: a bounded board with scrolling columns, limits, moves without dragging, Undo and side-panel details;
  - `trees.md`: tree and treegrid roles and keys, parent totals, persisted state and split views.
- SKILL.md recipes for these screen types.
- `calendars.md` covers sizes and layering:
  - entries and "+N more" are at least 24px tall with 12px text;
  - other months' day numbers are slate-500;
  - bars that share a grid with the day cells sit above them (`relative z-10`). A measured page drew every bar under its positioned day cells, so no leave was visible.

### Changed
- SKILL.md Foundations: a single HTML file with the Tailwind CDN uses the palette classes and needs neither `tokens.md` nor `tokens.css`. Traced agents had opened both, which added context but nothing to the page.
- Status badges stay on one line with the whole word (`whitespace-nowrap`), and the column takes the width of the longest status instead of abbreviating it.

### Fixed
- `audit.js` 0.5.1 recognises a month grid (7 cells a row, consecutive days of the month) and no longer checks it as a data table. Before, each day number counted as a left-aligned number without tabular figures, and each week row as too tall. One calendar page went from 36 to 70.
- `calendars.md`: `workingDays` used `toISOString()`, which gives the previous day east of UTC, so a holiday on a Friday was not excluded in Vietnam. It now uses local date parts.

### Docs
- README leads with a demo GIF: the same prompt built by Codex CLI and Claude Code, without and with the skill.
- README gives the current size of `SKILL.md` (248 lines, about 5k tokens) and the number of references (17).
- Benchmark: five briefs for the new screen types. Checklist pass rate: 33% without the skill, 50% with 0.5.7, 91% with the new references, which were written from these briefs' failures.

## [0.5.7] — 2026-11-06

### Added
- SKILL.md: an "Every screen ships with" list near the top. It names the parts agents most often leave out: states, one primary action, confirmation for destructive actions, single-line rows, dates with the time left, form essentials and announcements. In an A/B test at low reasoning effort on briefs that did not shape the list, the checklist pass rate went from 44% to 56%.
- The rule snippets in `adapters/` (AGENTS.md, Cursor, Copilot) start with the same list.

### Docs
- Benchmark: the cost per page with and without the skill, and how reasoning effort trades cost for completeness. At default effort the skill reached 93% of the checklist for $1.43 per page; at low effort, 78% for $0.53. Without the skill it was 26% for $0.30.

## [0.5.6] — 2026-11-05

### Added
- `audit.js` 0.5.0 adds three warnings for checklist items a browser can check:
  - `label-beside-field`: a form label to the left of its field instead of above it. Checked on form, settings and wizard pages.
  - `input-type`: an email or phone field without `type="email"` or `type="tel"`. The field's purpose comes from its name, id, autocomplete, aria-label or label.
  - `contact-link`: an email address or a formatted phone number in the main content that is not a `mailto:` or `tel:` link.

### Docs
- README links the live benchmark gallery, which shows the pages without and with the skill side by side.
- README reports a blind re-review of 12 pages. It agreed with the open review on 97% of checklist items and gave the same gap (41% → 89% blind, 39% → 89% open).

## [0.5.5] — 2026-11-05

### Fixed
- Next.js: SKILL.md (Mock data) and `react-shadcn.md` say to read `params`, `searchParams` and `?state=` in a client component under `<Suspense>`, and to run `next build` before calling a page done. With `cacheComponents`, the default for new Next 16 apps, a page that awaits them fails `next build` while `tsc` and `eslint` pass.

### Docs
- README results add Codex CLI (checklist 33% → 96%) and a Next.js 16 + shadcn/ui app (44% → 93%).

## [0.5.4] — 2026-11-05

### Changed
- Breadcrumbs end with the record's number when records are known by number (contracts, orders, invoices), and with its name otherwise.
- Record pages list changes that need sign-off (amendments, revisions, price changes) with number, effective date, summary, status and who approved them, or "Pending approval" and who it is waiting for.
- Form labels are `block`. Before, an inline `<label>` sat beside short fields such as dates and phone numbers.

## [0.5.3] — 2026-11-05

### Added
- `audit.js` 0.4.0 adds the `sticky-inert` rule: a `sticky` element whose overflow wrapper grows with the content, so the page scrolls instead and the element scrolls away. A bottom action bar with buttons is an error; a sticky header or totals row is a warning. Only vertical stickiness is checked.

### Fixed
- `tables.md` and `navigation-layout.md` no longer suggest a sticky header row inside an `overflow-x-auto` container that grows with its rows. A frozen header or totals row needs a container with a height that scrolls both ways.

## [0.5.2] — 2026-11-05

### Added
- Record pages show contact values as links: email as `mailto:`, phone as `tel:`, and a website that opens in a new tab. The primary contact carries a "Primary" badge.
- Tables whose rows carry a due or expiry date open with the rows that need attention first: expired or overdue, then due soon, then the rest. The status badge says which group a row is in ("Expires in 12 days"). Other tables open newest first.
- Forms with three or more sections offer "Save draft" between Cancel and Save. A draft keeps the record in Draft status and skips the required-field checks until the final submit.

### Changed
- Forms are one field per row. The only exception is two short fields that read as one value (City · Postal code), and the Verify checklist and the adapters now include this rule. Before, agents read "short related fields may share a row" as permission to lay out forms on a grid.
- Forms use the input type that matches the value (`email`, `tel`, `url`, `date`), not `inputmode` alone.
- The sticky action bar section explains where `sticky` sticks. An `overflow-y-auto` main inside a `min-h-screen` shell never scrolls itself, so the bar never sticks.

### Fixed
- `audit.js` 0.3.1: `table-above-fold` no longer checks form, detail, dashboard, settings or wizard pages. Before, it gave a false-positive warning when a table sat below the fold on those pages.

## [0.5.1] — 2026-11-05

### Fixed
- README: the results section says what was measured and how. That is v0.1.0, with the agent told to read `SKILL.md`, scored by the skill's own audit and one reviewer per page who knew the condition.
- README: the install section lists user folders and the `gh skill --agent` flag. It marks the Antigravity and Codex installers as not yet tested and gives the Claude Code plugin invocation.
- The Cursor rule snippet is always applied (`alwaysApply: true`).
- The skill's references no longer cite internal benchmark codes or ask you to run `npm run validate`.
- Issue templates use the repository's existing labels, and there is a general bug template.

## [0.5.0] — 2026-11-05

### Added
- Five references, for 13 in total:
  - `data-formatting` (numbers, money, dates, time zones, empty values, a vi-VN profile, a shared formatter module);
  - `bulk-import-export`;
  - `accessibility` (WCAG 2.2 AA checklist);
  - `anti-patterns` (23 template tells, each with its fix and a way to detect it);
  - `react-shadcn` (TanStack Table, react-hook-form + zod, URL state, shadcn Sidebar).
- Review mode in `SKILL.md`. Findings are reported as `path:line — rule — fix`, grouped by level (`data`, `states`, `a11y`, `layout`, `tells`), with counts.
- Rule snippets for `AGENTS.md`/`CLAUDE.md`, Cursor (`.mdc`, always applied) and GitHub Copilot in `adapters/`, generated from `SKILL.md`.
- `audit.js` 0.3.0 adds the `hidden-overridden` rule: an element with the `hidden` attribute that a `flex`/`grid` class keeps visible.
- Plugin manifests for Claude Code (`.claude-plugin/`), Agent Plugins 1.0 / Antigravity (`plugin.json`) and Codex (`.agents/plugins/marketplace.json`).
- README in English, Vietnamese and Simplified Chinese, with before/after images from the benchmark runs.

### Changed
- **Sizes.** Field labels, help text and error messages are 14px. 12px is for captions, badges, nav group labels and timestamps only.
- **Mock-data states** are reached through `?state=empty|error|loading` instead of a visible switcher.
- **Sortable numeric headers.** The cell holds the padding and the sort button keeps `text-right`, so a wrapped label stays right-aligned.
- **Single-HTML pages** add `[hidden] { display: none !important; }`.
- **Consistency pass across references:**
  - one formatter module and one locale source;
  - one destructive-confirmation pattern, kept open while the request runs;
  - one selection-reset rule;
  - jobs with failures never end in a success toast;
  - Next is never disabled;
  - every citation checked against its source.
- **Accent wording.** DESIGN.md's accent, or `#1d4ed8` when it has none.

## 0.1.0 — 2026-11-04 (not released)

### Added
- `SKILL.md` with:
  - scope and precedence;
  - a workflow;
  - six page recipes (list, record detail, create/edit form, dashboard, settings, wizard and import) plus roles, permissions and approvals;
  - states and saving rules;
  - table rules;
  - foundations;
  - template tells;
  - a verify checklist.
- Eight references: `tables`, `filters-search`, `forms`, `feedback-states`, `permissions-audit`, `navigation-layout`, `dashboards-charts`, `tokens`.
- `assets/tokens.css` (shadcn variable names, light and dark, Tailwind v4 `@theme`) and `assets/DESIGN.template.md` (Google design.md format).
- `scripts/audit.js`, a dependency-free browser audit (17 rules, 0–100 score). Version 0.2.0 replaces the tracked-uppercase rule with `uppercase-text`.
- Benchmark: 8 briefs plus 3 held-out briefs with acceptance checklists, and runs without and with the skill. Kept in the development repository, not published here.

[0.5.10]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.10
[0.5.9]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.9
[0.5.8]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.8
[0.5.7]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.7
[0.5.6]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.6
[0.5.5]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.5
[0.5.4]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.4
[0.5.3]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.3
[0.5.2]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.2
[0.5.1]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.1
[0.5.0]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.0

