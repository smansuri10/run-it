# Run It — Agent Quick Reference

Keep this open while working. It tells you what to paste and when.

## Before any session — 60-second checklist

- [ ] Is AGENT_LOG.md committed and up to date?
- [ ] Do I have the right source files ready to paste?
- [ ] Do I have Figma screenshots if building/testing a UI feature?
- [ ] Do I know exactly what I want this session to produce?

## What each agent needs

### Agent 1 — Backend engineer
| Item                  | Required?                        | Notes                          |
| --------------------- | -------------------------------- | ------------------------------ |
| AGENT_1_BACKEND.md    | Always                           | The full prompt file           |
| AGENT_LOG.md          | Always                           | Current state                  |
| Relevant source files | Always                           | Only files being modified      |
| Figma screenshots     | If building a UI-facing endpoint | So it knows the expected shape |
| Task description      | Always                           | Specific, not vague            |

### Agent 2 — QA engineer
| Item                | Required? | Notes                                  |
| ------------------- | --------- | -------------------------------------- |
| AGENT_2_QA.md       | Always    | The full prompt file                   |
| AGENT_LOG.md        | Always    | Current state                          |
| Agent 1's new files | Always    | The code to test                       |
| Figma screenshots   | Optional  | Helps with response shape expectations |
| Task description    | Always    | Mirror what Agent 1 just built         |

### Agent 3 — Tech writer
| Item                  | Required?               | Notes                         |
| --------------------- | ----------------------- | ----------------------------- |
| AGENT_3_TECHWRITER.md | Always                  | The full prompt file          |
| AGENT_LOG.md          | Always                  | Current state                 |
| Agent 1's new files   | Always                  | What was built                |
| Agent 2's findings    | Always                  | What edge cases were found    |
| Figma screenshots     | If documenting a screen | Visual context                |
| Task description      | Always                  | What to document this session |

## Session flow per feature

1. Open Chat 1 (Agent 1 — Backend)
   - Paste AGENT_1_BACKEND.md + AGENT_LOG.md + source files + task
   - Agent 1 builds the feature
   - Review the output carefully
   - Copy new files into your project
   - Run npm run dev — verify it works manually
   - Update AGENT_LOG.md with Agent 1's entries
   - git add . && git commit -m "feat: [feature name]"

2. Open Chat 2 (Agent 2 — QA)
   - Paste AGENT_2_QA.md + updated AGENT_LOG.md + Agent 1's new code
   - Agent 2 writes tests
   - Copy test files into tests/unit/ or tests/integration/
   - Run npm test
   - If failures: paste error output back into Chat 1 for fixes
   - If passing: update AGENT_LOG.md with Agent 2's entries
   - git add . && git commit -m "test: [feature name]"

3. Open Chat 3 (Agent 3 — Tech writer) — optional per feature,
   required at end of each phase
   - Paste AGENT_3_TECHWRITER.md + updated AGENT_LOG.md + Agent 1 code + Agent 2 findings
   - Agent 3 produces ADRs and feature docs
   - Copy docs into docs/adr/ and docs/features/
   - Update AGENT_LOG.md with Agent 3's entries
   - git commit -m "docs: [feature name]"

## When tests fail

Test fails → Is the test wrong or is the code wrong?

The test is wrong if:
- It tests implementation details rather than behaviour
- It makes incorrect assumptions about the API contract
- It has a setup/teardown bug
→ Fix in Chat 2 (Agent 2)

The code is wrong if:
- The test correctly describes expected behaviour
- The failure reveals a real edge case
- An error message is wrong or missing
→ Paste the failure into Chat 1 (Agent 1) with:
"This test failed — here's the error. Review your implementation and fix it."

## Context window management

Chat 1 (Backend): Keep alive for the whole feature. Start a new session
only when moving to a genuinely different feature. Before starting fresh,
paste the old session's key decisions into AGENT_LOG.md.

Chat 2 (QA): Always fresh per feature. Cold perspective = better tests.

Chat 3 (Tech writer): Keep alive across multiple features if possible.
A running narrative produces more coherent docs than restarting every time.
When context gets too large, ask it to summarise before starting fresh.

## Folder structure

run-it/
├── AGENT_LOG.md              ← update and commit constantly
├── docs/
│   ├── adr/                  ← Agent 3 writes here
│   │   ├── ADR-001-*.md
│   │   └── ADR-002-*.md
│   └── features/             ← Agent 3 writes here
│       ├── auth.md
│       └── games.md
├── agent-prompts/
│   ├── AGENT_1_BACKEND.md
│   ├── AGENT_2_QA.md
│   ├── AGENT_3_TECHWRITER.md
│   └── QUICK_REFERENCE.md
└── src/ ...

## Commit message convention

feat:  new feature (Agent 1 output)
test:  new or updated tests (Agent 2 output)
docs:  documentation and ADRs (Agent 3 output)
fix:   bug fix from failed tests
chore: config, deps, migrations

Example: git commit -m "feat: POST /auth/register and /auth/login"