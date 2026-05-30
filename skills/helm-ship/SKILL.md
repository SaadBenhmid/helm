---
name: helm-ship
description: Helm Phase 5 — run the production-readiness checklist with loud gates on secrets, data-loss, and auth. Produces .helm/SHIP.md.
---

# Phase 5 — Ship

Goal: a real, deployable production SaaS — not a demo.

## Steps
1. Copy `templates/SHIP.md` to `.helm/SHIP.md` if absent.
2. Work the checklist. **Loud gates** (hard to skip) on the 3 killers:
   - 🔑 **Secrets** — no keys/credentials in code or client bundles; env vars used.
   - 🗑️ **Data-loss** — backups/migrations safe; destructive ops guarded.
   - 🔓 **Auth** — every protected route checks identity + permissions.
3. Verify build, run the full test suite, and do a real run-through of the golden path.
4. Record the result in `.helm/SHIP.md` and `.helm/DECISIONS.md`.
5. Run `node bin/helm.js advance` to mark the journey complete.

## Rules
- The 3 killer gates are loud by default; the user may override with explicit confirmation
  (their responsibility), but never silently.

## Brownfield (existing projects)
- Run the **full existing test/build suite** as a regression gate before shipping — the change
  must not break anything outside its scope.
- After shipping a milestone, ask the user if they want to start the next one. If yes, run
  `node bin/helm.js milestone` to loop back to a fresh PRD for the next feature/fix.

## Context & memory (always)
- This phase's memory = `.helm/SHIP.md` + `state.json` + `DECISIONS.md`. Keep them current — they survive a `/clear`.
- Keep working context **≤ 40% (hard 50%)**; if approaching, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`.
