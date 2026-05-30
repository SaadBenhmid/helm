---
name: helm-adopt
description: Helm Phase 0 for EXISTING projects — map and understand the codebase before changing anything. Produces .helm/CODEBASE.md, a Serena index, and seeded decisions.
---

# Phase 0 (brownfield) — Adopt

Goal: make Helm (and every future session) understand this existing project, so changes are
safe and respect what's already there. Change nothing in this phase except `.helm/` docs.

## Steps
1. **Map the codebase.** Use subagents to explore so the main window stays lean. Identify:
   stack & languages, entry points, folder structure, key modules, data model, external
   services, build/test/run commands.
2. **Write `.helm/CODEBASE.md`** from `.helm/runtime/templates/CODEBASE.md`: stack, architecture, the
   existing **patterns/conventions** to follow, build/test commands, and risky areas.
3. **Install + build the code index (Serena)** so later sessions navigate by symbol instead of
   re-reading files. Note the re-index command in `CODEBASE.md`.
4. **Seed memory:** record the inferred stack/architecture choices in `.helm/DECISIONS.md`, and
   log any obvious tech-debt / risks in `.helm/ISSUES.md`.
5. **Set the model role slots** in `.helm/helm.config.json` (plan / build / review). Confirm.
6. When the user confirms the map looks right, run `node .helm/runtime/bin/helm.js advance` to move to the
   first milestone's PRD.

## Rules
- **Read-only on app code.** Do not refactor, reformat, or "improve" anything yet.
- Capture patterns as they ARE, not as you'd prefer them — later work must match the codebase.
- If the project is large, prefer breadth first (the map) over reading every file.

## Context & memory (always)
- This phase's memory = `.helm/CODEBASE.md` + `state.json` + `DECISIONS.md`. Keep them current — they survive a `/clear`.
- Keep working context **≤ 40% (hard 50%)**; offload exploration to subagents that return short summaries. If approaching the cap, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`. After advancing, `/clear` so the PRD phase starts fresh and rehydrates from `.helm/CODEBASE.md`.
