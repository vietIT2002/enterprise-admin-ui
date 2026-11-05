# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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

[0.5.6]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.6
[0.5.5]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.5
[0.5.4]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.4
[0.5.3]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.3
[0.5.2]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.2
[0.5.1]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.1
[0.5.0]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.0
