# Helm-managed project

This project is driven by **Helm**. At the START of every session, before doing
anything else, invoke the **helm-bootstrap** skill. It reads project state and
tells you the exact next action. Do not guess the next step — let Helm route you.

- Memory lives in `.helm/` (state.json, DECISIONS.md, ISSUES.md, handoff.md).
- Spec is the source of truth: code follows spec, never the reverse.
- Critical actions (touching Helm core, framework swap, secrets/data/auth) require user confirmation.

## Who runs commands (important)

**You, the AI, run every Helm command yourself** — `npx helm status|advance|snapshot|rollback`
(or `node bin/helm.js …` in dev). The user never types commands.

- The **only** thing you ask the user to do is **confirm moving to the next phase** before you
  run `helm advance`. Phrase it plainly: *"Ready to move on to <next phase>?"*
- Manage context and memory **automatically** per the protocol below — never ask the user to
  `/clear`, write handoffs, or manage tokens. You do it.
- Run `helm status` at the start of every session yourself and tell the user where things stand.

## Context & memory (always on — from the very first phase)

Helm manages context by **phase**, not by session. This applies from Validate onward.

1. **Rehydrate cheaply.** On session start, load only the small `.helm/` files —
   `state.json`, the current phase's artifact (e.g. `VALIDATION.md`, `PRD.md`), and
   `handoff.md` if present. **Never re-read a previous phase's conversation** — its
   conclusions already live in its artifact.
2. **Memory = on-disk artifacts.** Each phase writes its output to `.helm/` and updates
   `state.json` + `DECISIONS.md`. Those files ARE the memory that survives a `/clear`.
3. **Stay under budget.** Keep working context **≤ 40% (hard cap 50%)**. When approaching:
   write `.helm/handoff.md`, then `/compact` or `/clear`, then re-invoke `helm-bootstrap`.
4. **Reset between phases.** After `node bin/helm.js advance`, write `handoff.md`, then
   `/clear`. The next phase starts fresh and rehydrates from `.helm/` — so a long Validate
   chat never stacks onto PRD, PRD never stacks onto Mockup, etc.
5. **Offload bulk work.** Send heavy research / code reading to subagents that return a
   short summary, keeping the main window lean.
