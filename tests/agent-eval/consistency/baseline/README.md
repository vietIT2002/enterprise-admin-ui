# Baseline runs (part 1)

These are the six agent runs from the part 1 baseline. The results are written up in `docs/superpowers/evals/2026-11-19-consistency-baseline.md`, and the run setup is in `../scenarios.md`.

Each run keeps the following:
- `app/`: the five pages and any files the agent added, exactly as the agent left them. This is agent output, kept as data for regrading. It is not maintained code.
- `report.json`: the grader's output, from `grade.mjs` at commit `6db48a3`.
- `reply.md`: the controller's summary of the agent's final reply.

| Run | Skill | Prompt |
|---|---|---|
| r01, r02 | released (`bc0a566`) | P1 |
| r03, r04 | released (`bc0a566`) | P2 |
| r05 | none | P1 |
| r06 | none | P2 |

To regrade one run, for example after a grader change:

```
node tests/agent-eval/consistency/grade.mjs tests/agent-eval/consistency/fixture tests/agent-eval/consistency/baseline/r01/app --out <dir>
```
