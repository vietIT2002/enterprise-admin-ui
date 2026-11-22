# Consistency and redesign scenarios

These runs measure how a version of the skill handles an existing app. The app is AI-made and its pages are inconsistent: the five pages in `fixture/`.

- Every run gets a fresh copy of the five pages, and nothing else.
- The agent under test sees only the run prompt below. It never sees `FIXTURE.md`, the grader or this file.
- Grade each run with `node tests/agent-eval/consistency/grade.mjs <fixture> <run>/app --out <run>/grade`.

## Isolation rules

These are the R3 rules (`../r3/scenarios.md`):
- Run from copies outside the repo, in folders with neutral names: `k1` for the skill, and `r01`…`r06` for the runs, each with its app in `rNN/app/`.
- Give each run its own parent folder.
- Use the same model for every run: sonnet.
- Use the same prompt for every run, except for the paths and the task.

## Run prompt templates

**With the skill.** Use this text verbatim:

```
You are working in the project at {PROJECT_DIR}. An Agent Skill for this kind of work is installed at {SKILL_DIR}: read {SKILL_DIR}/SKILL.md first and follow it, opening its references as it directs. Task: {TASK} Work only inside {PROJECT_DIR}. When you finish, reply with what you changed, or with your findings if the task is a review.
```

**Without the skill.** This is the same text with the skill sentence removed:

```
You are working in the project at {PROJECT_DIR}. Task: {TASK} Work only inside {PROJECT_DIR}. When you finish, reply with what you changed, or with your findings if the task is a review.
```

## Prompts

- **P1**
  - With the skill: "Apply the enterprise-admin-ui skill to this app."
  - Without the skill: "Improve this app's UI."
- **P2**, the same for both: "Redesign this attendance admin so it looks professional and consistent."

## Baseline matrix (part 1)

The released skill is `main` at `bc0a566`, taken with `git archive bc0a566 skills/enterprise-admin-ui`.

| Run | Skill | Prompt |
|---|---|---|
| r01 | released | P1 |
| r02 | released | P1 |
| r03 | released | P2 |
| r04 | released | P2 |
| r05 | none | P1 |
| r06 | none | P2 |

A run that produces no usable output is re-run once, and both attempts are recorded.
