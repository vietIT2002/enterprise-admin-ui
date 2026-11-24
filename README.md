# enterprise-admin-ui

**English** · [Tiếng Việt](README.vi.md) · [简体中文](README.zh-CN.md)

**AI coding agents build admin screens that look finished and break in use.** This Agent Skill makes Claude Code, Codex, Cursor, GitHub Copilot and other agents build them the way mature business software does.

| What agents often ship | What the skill has them build |
|---|---|
| A table with a search box and nothing else | Filters with removable chips, and a result count that follows them ("12 of 48 orders") |
| A form that throws away your input when saving fails | Errors next to each field, a summary that takes focus, and everything you typed still there |
| A Delete button that deletes at once | A confirmation that names the record and what happens to it |
| A blank area while loading, and nothing when the request fails | A skeleton while loading, an error with Retry, and an empty state with its next action |
| Small grey ALL-CAPS labels and KPI tiles on every page | Readable 14px text in sentence case, and the table in the first screen |

| 1 · See it | 2 · Install | 3 · Try a prompt |
|---|---|---|
| [The same screens, without and with the skill](https://vietit2002.github.io/enterprise-admin-ui-benchmark/?suite=heldout3) | `npx skills add vietIT2002/enterprise-admin-ui`<br>Windows: `npx.cmd skills add vietIT2002/enterprise-admin-ui --copy` | `/enterprise-admin-ui Build the orders list page for our ERP: filters, bulk actions, pagination` |

![The same orders page from the same prompt and the same data, without and with the skill: filters and result count, a search with no results, and deleting an order](docs/img/same-data-orders.png)

**Measured on screens nobody tuned it for** (12 screens, checklists written independently, reviewed blind): pages built with the skill did **44%** of what each screen needed, against **19%** without it. By theme: empty, loading and error states 12% → 59%; search, filters and counts 16% → 54%; a confirmation before deleting 25% → 63%. It more than doubles what agents get right and leaves the rest for your review. [How this was measured](#results).

[![CI](https://github.com/vietIT2002/enterprise-admin-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/vietIT2002/enterprise-admin-ui/actions/workflows/ci.yml) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![References: 17](https://img.shields.io/badge/references-17-blue) ![Audit rules: 22](https://img.shields.io/badge/audit%20rules-22-blue) ![Version 0.5.10](https://img.shields.io/badge/version-0.5.10-blue)

## Install

Open a terminal in your project folder and run the command for your system. The `skills` CLI needs Node.js 22.20 or later. It asks which agents to install for and puts the skill in each agent's folder.

**macOS / Linux** (Terminal):

```bash
npx skills add vietIT2002/enterprise-admin-ui
```

**Windows** (PowerShell):

```powershell
npx.cmd skills add vietIT2002/enterprise-admin-ui --copy
```

- Use `npx.cmd`, not `npx`. PowerShell's default policy blocks `npx.ps1` with "running scripts is disabled on this system". In Command Prompt, `npx` works.
- `--copy` writes real files. Without it, an install for several agents links them with a junction to an absolute path, which breaks when the project moves or is cloned.

<details>
<summary><b>Flags, every project, updates</b></summary>

Useful flags, the same on every system:
- `-a claude-code` picks the agent without the prompt (also `codex`, `cursor`, `github-copilot`, `antigravity` …), and `-y` skips confirmations.
- `-g` installs into your user folder for every project, instead of this project only.

For example, Claude Code in every project:

```bash
# macOS / Linux
npx skills add vietIT2002/enterprise-admin-ui -g -a claude-code -y
```

```powershell
# Windows
npx.cmd skills add vietIT2002/enterprise-admin-ui -g -a claude-code -y --copy
```

To update later, run `npx skills update` (`npx.cmd skills update` on Windows).

</details>

<details>
<summary><b>Manual install (any agent)</b></summary>

Copy the folder `skills/enterprise-admin-ui` into your agent's skills folder (see the table). These commands install it for Claude Code in the current project; for another agent, replace `.claude/skills` with its folder.

macOS / Linux:

```bash
T=$(mktemp -d)
git clone --depth 1 https://github.com/vietIT2002/enterprise-admin-ui.git "$T"
mkdir -p .claude/skills && cp -R "$T/skills/enterprise-admin-ui" .claude/skills/
```

Windows (PowerShell):

```powershell
$t = Join-Path $env:TEMP ([guid]::NewGuid())
git clone --depth 1 https://github.com/vietIT2002/enterprise-admin-ui.git $t
New-Item -ItemType Directory -Force .claude\skills | Out-Null
Copy-Item -Recurse -Force "$t\skills\enterprise-admin-ui" .claude\skills\
```

Copy rather than symlink, because symlinks are unreliable on Windows.

| Agent | Project folder | User folder |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Cursor | `.agents/skills/` or `.cursor/skills/` | `~/.agents/skills/` or `~/.cursor/skills/` |
| GitHub Copilot | `.github/skills/` or `.agents/skills/` | `~/.copilot/skills/` |
| Antigravity | `.agents/skills/` | `~/.gemini/config/skills/` |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` |

</details>

<details>
<summary><b>Plugins and other installers</b></summary>

Claude Code plugin marketplace:

```text
/plugin marketplace add vietIT2002/enterprise-admin-ui
/plugin install enterprise-admin-ui@enterprise-admin-ui
```

GitHub CLI 2.90 or later (`gh skill` is in public preview). It installs for GitHub Copilot by default; add `--agent claude-code`, `--agent cursor` and so on for other agents:

```bash
gh skill install vietIT2002/enterprise-admin-ui enterprise-admin-ui
```

Kiro: import from GitHub with the skill folder URL `https://github.com/vietIT2002/enterprise-admin-ui/tree/main/skills/enterprise-admin-ui`.

Not yet tested end to end (the manifests follow the published formats):

```bash
agy plugin install https://github.com/vietIT2002/enterprise-admin-ui
codex plugin marketplace add vietIT2002/enterprise-admin-ui
```

</details>

<details>
<summary><b>Always-on rules (AGENTS.md, Cursor, Copilot)</b></summary>

Skills load when the agent decides they apply. To keep the core rules in every session, paste a generated snippet into your project:

| File | Paste into |
|---|---|
| [`adapters/AGENTS.snippet.md`](adapters/AGENTS.snippet.md) | `AGENTS.md` or `CLAUDE.md` |
| [`adapters/cursor/enterprise-admin-ui.mdc`](adapters/cursor/enterprise-admin-ui.mdc) | `.cursor/rules/` (it uses `alwaysApply: true`) |
| [`adapters/copilot-instructions.snippet.md`](adapters/copilot-instructions.snippet.md) | `.github/copilot-instructions.md` |

</details>

## Use it in your project

After installing, open the project in your agent and start a new session so the agent finds the skill. Then type:

| Agent | Type in the chat |
|---|---|
| Claude Code | `/enterprise-admin-ui` and your request (installed as a plugin: `/enterprise-admin-ui:enterprise-admin-ui`) |
| Codex | `$enterprise-admin-ui` and your request, or pick it from `/skills` |
| Cursor | `/enterprise-admin-ui` in Agent chat |
| GitHub Copilot in VS Code | `/enterprise-admin-ui` in chat |
| Antigravity, Kiro and others | Your request, plus "use the enterprise-admin-ui skill" |

Examples:

```text
/enterprise-admin-ui Build the orders list page for our ERP: filters, bulk actions, pagination
/enterprise-admin-ui Build the customer create/edit form with validation and Save draft
/enterprise-admin-ui Review app/orders/page.tsx
```

- **Build a screen:** name the screen and its data. In a project with several screens, the skill first creates `DESIGN.md` (product, roles, locale, status names) from your answers or the code, and later screens follow it.
- **Review:** ask it to "review" or "audit". It lists findings as `path:line — rule — fix`, grouped by level, and changes code only when you ask for fixes.
- **No command needed:** a request for a management screen loads the skill on its own (20/20 prompts in Claude Code). Naming it makes sure.

## Scope

The skill covers screens behind a login:
- admin panels and back-office tools;
- ERP, CRM, HRM, accounting, inventory and POS back-office;
- internal tools and B2B SaaS app screens.

It is not for landing pages or marketing sites. For those, use an aesthetics skill such as `frontend-design`.

If your project already has a design system or a customised component library, the skill keeps your components and tokens and applies only the layout, state and behaviour rules.

## What's inside

```
skills/enterprise-admin-ui/
├─ SKILL.md            249 lines: workflow, page recipes, states, saving, tables, foundations, Review mode
├─ references/         17 files, loaded only when the task needs them
├─ scripts/audit.js    dependency-free browser audit, 22 rules, score 0–100
├─ scripts/audit-cli.mjs  runs the audit from a terminal in headless Chrome or Edge, no dependencies; --states and --checks test the states and behaviour
└─ assets/
   ├─ templates/           optional single-file list, detail and form pages
   ├─ tokens.css           shadcn-compatible tokens, light and dark, Tailwind v4 @theme
   └─ DESIGN.template.md   per-project decision file (Google design.md format)
```

**Page recipes:** list, record detail, create/edit form, dashboard, settings, wizard and CSV import, plus roles, permissions and approvals. Each recipe says what the screen contains, and in what order.

**References:**

| File | Covers |
|---|---|
| `tables.md` | density, alignment, sorting, selection, pagination, inline edit |
| `filters-search.md` | filter bars, chips, saved views, search, URL state |
| `forms.md` | layout, validation, save models, line items, unsaved changes |
| `feedback-states.md` | empty, loading and error states, toasts vs banners, confirmations, long jobs |
| `permissions-audit.md` | roles, approvals, audit history, status vocabulary |
| `navigation-layout.md` | app shell, sidebar, page header, breadcrumbs, settings navigation |
| `dashboards-charts.md` | operational dashboards, KPI tiles, chart choice |
| `tokens.md` | applying tokens in shadcn, Tailwind v3/v4 or plain CSS |
| `data-formatting.md` | numbers, money, dates, time zones, empty values, a vi-VN profile |
| `bulk-import-export.md` | select all matching, partial failures, CSV import, export |
| `accessibility.md` | WCAG 2.2 AA checklist for admin screens |
| `anti-patterns.md` | 23 "AI template" tells, each with its fix and a way to detect it |
| `react-shadcn.md` | TanStack Table, react-hook-form + zod, URL state, shadcn Sidebar |
| `reports-print.md` | reports (periods, comparisons, totals, export) and printable documents (invoices, payslips) |
| `calendars.md` | leave, shift and booking calendars: week start, multi-day bars, coverage, keyboard grid |
| `boards.md` | Kanban boards: columns and limits, moving cards without dragging, side-panel details |
| `trees.md` | trees and split views: chart of accounts, org charts, categories |

**Review mode.** Ask the agent to "review this screen". It reports findings as `path:line — rule — fix`, grouped by level (`data`, `states`, `a11y`, `layout`, `tells`), and changes code only when you ask.

**Audit.** Run it from a terminal, with no dependencies:

```bash
node <skill folder>/scripts/audit-cli.mjs http://localhost:3000/orders --type list
```

`<skill folder>` is where the skill is installed, such as `.claude/skills/enterprise-admin-ui`. The target can be a URL or an HTML file; a relative file path is read from the folder you run the command in. The CLI opens the page at 1440×900 in an installed Chrome, Edge or Chromium and prints the score. It exits with 1 on an ✗ error, so an agent or a CI job can act on it. On a page with mock data, add `--states`: the CLI also opens `?state=empty`, `?state=error` and `?state=loading` and checks each state: no data rows and an action of its own when empty, a `role="alert"` message and Retry on error, a skeleton while loading. In a browser console or with Playwright, inject `scripts/audit.js` and run `enterpriseAdminAudit({ pageType: 'list' })` instead. The audit measures:
- type size and scale;
- radius;
- row height and stacked rows;
- numeric alignment and tabular figures;
- a table pushed below the first screen on list pages;
- control names and target size;
- text contrast;
- gradients, glass and card shadows;
- ALL-CAPS labels;
- emoji icons;
- primary actions per header;
- hidden elements that a `flex` or `grid` class keeps visible;
- sticky bars and headers that never stick, because their overflow wrapper grows with the content instead of scrolling;
- form labels beside their field instead of above it, and email or phone fields without `type="email"` or `type="tel"`;
- email addresses and phone numbers shown as plain text instead of `mailto:` and `tel:` links.

## Results

The benchmark gives two kinds of numbers. They answer different questions, so read them apart:

| Question | How it is measured | Without | With the skill |
|---|---|---|---|
| **Does the page do what the screen needs?** | An acceptance checklist per screen, written by an agent that never read the skill. One reviewer per page, who does not know which setup built it. 12 screens, 108 items per side | 19% | **44%** |
| Does the page follow the skill's own rules? | The skill's audit (`audit.js`): text size, contrast, alignment, row height and template tells, scored 0–100. Same 12 screens, median score | 69 | 90 |

A page can score 100 on the audit and still miss much of what its screen needs. The audit checks the rules a browser can measure; the checklist checks whether the screen does its job. Judge the skill by the first row: it more than doubles what agents get right and still leaves more than half for your review.

Where the skill helps, and where it cannot, on the same 12 screens:
- **UI behaviour** (states, filters and counts, formatting, confirmations, keyboard access, print, export): 14% → **51%**.
- **Business rules the prompt did not state** (statutory payroll deductions, masking secrets in an audit log): 26% → 33%. Put those in your prompt or your project's docs; the skill does not know your business.

**Data:** every page, screenshot, audit and review, with the briefs, prompts and tools, is in [enterprise-admin-ui-benchmark](https://github.com/vietIT2002/enterprise-admin-ui-benchmark), and the [gallery](https://vietit2002.github.io/enterprise-admin-ui-benchmark/) shows the pages side by side. The two suites behind these numbers are [HELDOUT3](https://github.com/vietIT2002/enterprise-admin-ui-benchmark/blob/main/benchmark/runs/2026-11-06-heldout3-claude-green/HELDOUT3.md) and [HELDOUT4](https://github.com/vietIT2002/enterprise-admin-ui-benchmark/blob/main/benchmark/runs/2026-11-06-heldout4-new-claude-green/HELDOUT4.md).

<details>
<summary><b>Earlier measurements, and why they look higher</b></summary>

These came first. Their checklists were written by the skill's author, who knew its rules, and most reviews knew which setup built each page. The independent numbers above are lower and fairer.

- **Version:** measured on 2026-11-04 with v0.1.0 (8 references). The v0.5.0 changes were re-checked on 3 new pages (median audit score 100, checklist 22/22) and on 9 fix-round pages, not on the full suite.
- **Generation:** the same model (Claude Sonnet 5.5) built the same screens from the same briefs, in English and Vietnamese, once as usual and once told to read `SKILL.md` first. Output was single-file HTML with the Tailwind CDN.
- **Scoring:** the skill's own audit and an acceptance checklist. One reviewer agent judged each page and knew the condition; a blind re-review of 12 pages agreed on 97% of items. Checklist reviews cover runs 1–2 of each brief.

| | Without | With the skill |
|---|---|---|
| Median score on the skill's own audit (40 pages each) | 82 | 100 |
| Pages with low-contrast text | 68% | 0% |
| Pages with ALL-CAPS labels | 73% | 0% |
| Acceptance checklist, 3 screens the skill was never written against (6 pages each) | 35% | 72% |
| Acceptance checklist, 3 more new screens, with v0.5.2 (6 pages each)† | 39% | 89% |
| Acceptance checklist, 8 main screens (16 reviews each)\* | 56% | 100% |

\* The skill's recipes were written from the failures on these 8 screens, so this row overstates how it does on new screens. The held-out rows are the fairer numbers.

† These screens were written after the v0.5.2 rules. 4 of their 27 checklist items test those rules (5/8 → 8/8); the other 23 went from 35% to 87%.

![The same prompt built by Codex CLI and by Claude Code, without and with the skill, with audit and checklist scores](docs/img/demo.gif)

![Operations dashboard without and with the skill](docs/img/before-after-07-ops-dashboard.png)

![Invoice form without and with the skill](docs/img/before-after-03-invoice-form.png)

**Other settings** (2026-11-05, the same 3 new screens, 1 page per side each):
- Codex CLI (`gpt-6.1-sol`): checklist 33% → 96%, median audit score 62 → 100.
- A Next.js 16 + shadcn/ui app (Sonnet 5.5): checklist 44% → 93%.

</details>

**Triggering on its own** (Claude Code, Sonnet 5.5, 2026-11-05): without being named, the skill loaded for 20/20 management-screen prompts (10 EN, 10 VI) and for 0/10 landing-page prompts.

**Not measured yet:** Cursor and Copilot, and whether the skill loads on its own outside Claude Code.

## How it compares

Based on each skill's repository as of 2026-11-04.

| Skill | Focus | Management-screen workflow |
|---|---|---|
| `anthropics/skills` · `frontend-design` | Distinctive aesthetics, "aesthetic risk" | Not its goal |
| `nextlevelbuilder/ui-ux-pro-max` | Catalogue of styles and product types | Light (a line on bulk actions) |
| `Leonxlnx/taste-skill` | Art direction, app screens, a "tells" table | Partial |
| `pbakaus/impeccable` | Design detector (62 rules), an "Operate" mode for app screens | Partial (no audit log or pagination) |
| **enterprise-admin-ui** | Deliberately unflashy business screens | Lists, filters, bulk actions, line-item forms, permissions, audit history, approvals, import, locale formatting, all states |

**Measured on management screens** (blind, the same 12 independently written briefs, one page each, Claude Sonnet 5.5): enterprise-admin-ui passed **44%** of the acceptance checklist, ui-ux-pro-max 30%, impeccable 19%, frontend-design 18% and no skill 19%. These are this skill's home ground, and the other skills ran without their scripts. See [COMPARE](https://github.com/vietIT2002/enterprise-admin-ui-benchmark/blob/main/benchmark/runs/2026-11-07-compare-blind/COMPARE.md).

The skills work together. Use an aesthetics skill for the marketing site and this one for the app behind the login.

## FAQ

**Will it fight my design system?** No. A project design system or customised component library always wins; the skill then applies only layout, state and behaviour rules. A `DESIGN.md` in the project records your accent, density and status vocabulary, and the skill reads it first.

**How many tokens does it cost?** `SKILL.md` is 249 lines (about 20 KB, roughly 5k tokens). References load only when the task needs them, for example `tables.md` for a table.

**Does it handle Vietnamese and other locales?** Yes. Formatting goes through `Intl` with the project locale. `data-formatting.md` has a vi-VN profile:
- `1.250.000 ₫`;
- `dd/MM/yyyy HH:mm`;
- `Asia/Ho_Chi_Minh`;
- diacritic-insensitive search.

**How do I update?** It depends on how you installed:
- `npx skills add`: run `npx skills update` (`npx.cmd skills update` on Windows).
- `gh skill`: run `gh skill update`.
- A plugin: it updates when the plugin version changes.
- Manual copy: copy the folder again.

See [CHANGELOG.md](CHANGELOG.md).

**Does it work without React?** Yes. The rules are stack-neutral, and the examples use React, Tailwind and shadcn/ui. Single-file HTML with the Tailwind CDN is covered too.

## License

[MIT](LICENSE)
