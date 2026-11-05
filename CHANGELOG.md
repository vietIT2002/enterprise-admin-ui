# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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

[0.5.1]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.1
[0.5.0]: https://github.com/vietIT2002/enterprise-admin-ui/releases/tag/v0.5.0
