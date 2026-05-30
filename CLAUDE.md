# Helm-managed project

This project is driven by **Helm**. At the START of every session, before doing
anything else, invoke the **helm-bootstrap** skill. It reads project state and
tells you the exact next action. Do not guess the next step — let Helm route you.

- Memory lives in `.helm/` (state.json, DECISIONS.md, ISSUES.md, handoff.md).
- Spec is the source of truth: code follows spec, never the reverse.
- Critical actions (touching Helm core, framework swap, secrets/data/auth) require user confirmation.

## Who runs commands (important)

**You, the AI, run every Helm command yourself** with `node bin/helm.js status|advance|snapshot|rollback`
(the runtime is installed locally in this project by `npx github:SaadBenhmid/helm init`).
The user never types commands.

- The **only** thing you ask the user to do is **confirm moving to the next phase** before you
  run `helm advance`. Phrase it plainly: *"Ready to move on to <next phase>?"*
- Manage context and memory **automatically** per the protocol below — never ask the user to
  `/clear`, write handoffs, or manage tokens. You do it.
- Run `helm status` at the start of every session yourself and tell the user where things stand.

## Context & memory (always on — AUTOPILOT)

The user must never think about context, tokens, compaction, or commands. You manage all of it
silently:

- **Compaction is automatic.** Claude Code auto-compacts when the window fills; the `PreCompact`
  and `SessionEnd` hooks capture `.helm/handoff.md` first, and the `SessionStart` hook re-injects
  state after. So a single long session stays lossless — **never ask the user to `/compact` or
  `/clear`**, and never tell them to run a command (you run every `helm` command yourself).
- **Write memory continuously,** not just at phase end: append decisions to `DECISIONS.md`, issues
  to `ISSUES.md`, lessons to `LEARNINGS.md` as they happen, so any compaction is lossless by
  construction.
- If you ever notice the window is heavy mid-phase, offload exploration to a subagent and keep a
  fresh `.helm/handoff.md` — do it yourself, quietly.

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
6. **Hooks enforce it.** `helm hooks install` wires SessionStart (inject state), SessionEnd
   and PreCompact (auto-write `.helm/handoff.md`) — so memory is captured even if a session
   ends abruptly or the window auto-compacts. Run `helm lint` to health-check memory.
