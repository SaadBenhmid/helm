# Helm-managed project

This project is driven by **Helm**. At the START of every session, before doing
anything else, invoke the **helm-bootstrap** skill. It reads project state and
tells you the exact next action. Do not guess the next step — let Helm route you.

- Memory lives in `.helm/` (state.json, DECISIONS.md, ISSUES.md, handoff.md).
- Spec is the source of truth: code follows spec, never the reverse.
- Critical actions (touching Helm core, framework swap, secrets/data/auth) require user confirmation.
