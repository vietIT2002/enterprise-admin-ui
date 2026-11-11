# Check status, requirements and evidence in audit-cli (roadmap R4)

Status: proposed, 2026-11-11. Medium-sized.

## Why

`audit-cli.mjs --checks` reports each behaviour check as ✓, ✗, – or ?, plus an exit code. Two cases read as success when they are not:

- **An absent control.** A check whose control is missing (no Export button, no search box) is "skipped" with `ok: true`. A missing control can be correct (the screen has no export), absent by mistake, or present but not recognised by the name patterns. Today all three read as a pass.
- **What a pass proves.** "✓ export" proves only that an Export label names a count, not that the download is right. "✓ print" proves the title stays and the navigation hides under print media, not that a full document paginates.

Consumers (users, agents following SKILL.md Verify) may read exit 0 as "the workflow is complete". R4 makes each check say what was established, whether the screen needs it, and what was not checked.

## Goals

- Every behaviour check result has a `status`: `pass`, `fail`, `not_applicable`, `not_verified` or `error`.
- The user declares what a screen requires with `--require <checks>`, and what is out of scope with `--not-applicable <checks>`. Undeclared checks are optional.
- An absent control is:
  - `fail` when the check is required;
  - `not_applicable` when it is declared out of scope;
  - `not_verified` otherwise.
  It is never `pass`.
- Every result states its evidence: how it was observed, whether the basis is direct or heuristic, what was observed, and what it does not establish. The schema also admits manual evidence.
- Terminal output names unresolved requirements. JSON keeps the existing fields, so current consumers keep working.
- The audit score is unchanged. `audit.js` is not touched, so score-only baseline comparisons stay reproducible.
- Exit codes are documented for required and optional checks.

## Non-goals

- Changing `audit.js`, its rules, weights or score. This includes `table-row-height` on projects with an established taller row, which is a separate follow-up.
- A requirements file (`--requirements screens.json`). Flags come first, and a file can be added later without breaking them.
- Running the export or inspecting the downloaded file, and checking print pagination. R4 states these limits; it does not remove them.
- Per-rule statuses for the static audit (`metrics.applicable` already exposes coverage).

## Approaches considered

1. **Chosen:** CLI flags `--require` and `--not-applicable`. The agent knows the task's requirements and passes them. This is the smallest extension that meets every R4 acceptance criterion.
2. A requirements file per page. It scales to many pages, but it is more work, and the agent must create a file.
3. Infer requirements from `--type`. It needs no declaration, but it is a heuristic, which R4 asks to avoid ("declared screen requirements").

## Design

### Flags (`parseCli`)

- `--require <list>` and `--not-applicable <list>` take comma-separated check names from `CHECKS`: `search`, `export`, `print`, `confirm`, `live-region`.
- The following are `UsageError`s, exit 2:
  - an unknown name;
  - a name in both lists;
  - either flag without `--checks`.
- `opts.require` and `opts.notApplicable` are arrays, empty by default.

### Result shape (additive)

Each CheckResult keeps `check`, `ok`, `skipped`, `unverified`, `blocked`, `problems`, `note` and `error`, and adds:

```json
{
  "status": "pass | fail | not_applicable | not_verified | error",
  "required": true,
  "evidence": {
    "method": "interaction | dom | print-media | manual",
    "basis": "direct | heuristic | manual",
    "observed": "what the check saw, one sentence",
    "limitation": "what this does not establish, or null"
  }
}
```

- `ok` keeps its meaning: no failure and no error. `skipped` stays `true` when the check did not run.
- `status` is the field to read.
- `manual` is documented as allowed for results that a person records; the CLI never produces it.

### Status rules

These are applied after the existing judgement, so the existing `judge*` problem detection is unchanged.

| Situation | Required | Undeclared | Declared not applicable |
|---|---|---|---|
| Ran, no problems | pass | pass | not_applicable (the check does not run) |
| Ran, problems | fail | fail | not_applicable (the check does not run) |
| Control not found | fail, problem "required <check> not found" | not_verified | not_applicable |
| Confirm found, no `--disposable` | not_verified | not_verified | not_applicable |
| Could not run (error) | error | error | — |

A declared not-applicable check does not open a tab or click anything.

### Evidence per check

| Check | Method / basis | What it establishes | Limitation |
|---|---|---|---|
| search | interaction / direct | a search that matches nothing changes the rows, the message and (on a list) the count | only one no-match query; real matching is not checked |
| export | dom / direct | the Export control's label names a count | the export was not run; the file's scope and rows are not checked |
| print | print-media / direct | under print media the title shows, and the navigation and buttons hide | pagination and a full printed document are not checked |
| confirm | interaction / direct | clicking the first destructive control opens a dialog or `confirm()`; requests are blocked | only the first destructive control; the confirm action is never submitted |
| live-region | dom / direct | the count of `role="status"`, `role="alert"` and `aria-live` regions | whether messages are announced is not checked |
| any check, control not found | dom / heuristic | no control matched the name patterns | the control may exist under another name |

### Exit codes

- **2:** a page, state or check could not run, or a usage error. Unchanged.
- **1:** any of these:
  - an ✗ audit error (or any violation with `--strict`);
  - a failed state;
  - a check with status `fail` (this includes a required check whose control is missing);
  - **a required check that is `not_verified`**, for example a required confirm without `--disposable`. A requirement the user asked to verify and that could not be verified does not exit 0.
- **0:** otherwise. Optional `not_verified` and `not_applicable` checks do not change the exit code.

### Terminal output

- Check lines keep their marks:
  - ✓ pass;
  - ✗ fail;
  - ? not_verified;
  - – not_applicable;
  - ✗ "could not check" for an error.
- A required check is labelled `(required)`.
- After the check lines comes one summary line, for example `Checks: 2 pass · 1 fail · 1 not verified · 1 not applicable`.
- When there are unresolved requirements, one more line follows, for example `Required but not shown to pass: export (no Export control found), confirm (run with --disposable)`.
- With `--json`, the same information is in the fields above.

### States (`--states`)

Each state result gets `status: pass | fail | error`, mapped from its existing fields. States are always required once `--states` is given.

### Docs

- `--help` and the header comment: the new flags, statuses and exit codes.
- SKILL.md Verify: one or two sentences (≤ 40 words) telling agents to pass `--require` for what the task asks the screen to do, and saying that `?` means not verified.
- CHANGELOG, Unreleased.

### Tests (TDD)

- **Unit:**
  - `parseCli`: both flags, plus the error cases.
  - Status mapping for every row of the status table.
  - Evidence present on every check.
  - `exitCode`: required `not_verified` gives 1; optional `not_verified` gives 0.
  - `formatText`: the summary and unresolved lines.
- **End to end**, using the existing test-server pages:
  - `/checks-settings` with `--require export` → export `fail`, exit 1.
  - `/checks-settings` with `--not-applicable export` → `not_applicable`, exit 0.
  - `/checks-settings` with nothing declared → export `not_verified`, exit 0.
  - `/checks` with `--require confirm` and no `--disposable` → `not_verified`, exit 1.
  - `/checks` with `--require confirm --disposable` → `pass`.
- The existing tests that assert `skipped`/`ok` keep passing, or are updated only where they asserted the old "absent counts as ok" meaning without `status`.

## Builder's calls

- Function names and where status mapping lives (one `withStatus(result, {required, notApplicable})` after judging is suggested).
- The exact wording of observed/limitation strings within the evidence table's meaning.

## Done when

- Every acceptance criterion of roadmap R4 has a test.
- `npm test` and `npm run check:adapters` pass.
- The `audit.js` score is unchanged: `git diff` shows no change to `scripts/audit.js`.
- SKILL.md grows by at most 40 words.
- Commits and PR text carry no Claude or Claude Code attribution.
