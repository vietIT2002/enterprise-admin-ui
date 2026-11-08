# Contributing

Thanks for helping. To report a problem, open an issue with one of the templates: bug, audit false positive, rule proposal or tool compatibility.

## Setup

You need Node.js 22 or later.

```bash
npm install
npx playwright install chromium   # optional: without it, the fixture tests use an installed Google Chrome
npm test
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd`.

To try the audit on a page: `npm run audit -- tests/fixtures/list-clean.html --type list`.

## What the tests check

| File | Checks |
|---|---|
| `tests/audit-internals.test.mjs` | The DOM-free helpers in `audit.js`: numbers, phone numbers, colours, contrast, shadows, gradients |
| `tests/audit-fixtures.test.mjs` | `audit.js` in Chromium at 1440×900 on every page in `tests/fixtures/` |
| `tests/audit-cli-unit.test.mjs` | The CLI's argument parsing, browser lookup, file URLs and exit codes |
| `tests/audit-cli.test.mjs` | `scripts/audit-cli.mjs` run as a command on the fixtures and on pages served locally: redirects, HTTP errors, refused connections, skeletons, pages that never settle. On Linux and macOS also Ctrl+C and misbehaving browsers, with `tests/helpers/fake-browser.mjs` |
| `tests/adapters.test.mjs` | `adapters/` is what `tools/build-adapters.mjs` builds from `SKILL.md` |
| `tests/repo-facts.test.mjs` | The numbers and names in the three READMEs, the plugin manifests and `CHANGELOG.md` match the files |

CI runs all of them on every push to `main` and every pull request. A failing test shows as an annotation on the pull request.

## Changing SKILL.md

The snippets in `adapters/` copy four parts of `SKILL.md`: the "Every screen ships with" list, the Foundations table, the "Template tells to remove" table and the Verify checklist. After you change any of them, run `npm run build:adapters` and commit the result.

When the line count of `SKILL.md` changes, update "248 lines" in the three READMEs. The test failure names each place.

## Changing audit.js

- **Fixtures.** Each page in `tests/fixtures/` is a small HTML file whose `<head>` declares the page type and the exact rules the audit must report:

  ```html
  <meta name="audit-page-type" content="list">
  <meta name="audit-expect" content="numeric-align tabular-nums">
  ```

  Use `content=""` for a page that must score 100.
- **A false positive.** Add the page that was flagged wrongly as a clean fixture, then fix the rule.
- **A new rule.** Add a fixture that fails it: a test checks that every rule fails on at least one fixture. Update the rule count in the READMEs and their badges.
- **Versions.** Bump `VERSION` in `audit.js` and describe the change under `[Unreleased]` in `CHANGELOG.md`.

## Adding a reference

List it in the References table of `SKILL.md` and in the references table of each README, and update the count. The tests check all three.

## Pull requests

- Describe the change under `[Unreleased]` in `CHANGELOG.md`.
- Keep development files out of `skills/enterprise-admin-ui/`. Tests and tools live at the repository root, so `npx skills add` installs only the skill.
