---
name: helm-build
description: Helm Phase 4 — build the SaaS in small vertical slices with plan→build→review, automated checks, and clean memory. Includes context-cap and self-evolve rules.
---

# Phase 4 — Build loop

Goal: ship the PRD slice by slice, keeping quality high and tokens low.

## Per-slice loop
1. **Plan** the slice with the `plan` model (smallest shippable vertical slice).
2. **Build** it with the `build` model.
3. **Review + auto-fix** with the `review` model.
4. Run tests + the **3 killer checks** (secrets, data-loss, auth). Soft nudges elsewhere.
5. Update memory: `.helm/STATE`, `DECISIONS.md`, `ISSUES.md`. Re-index the code map.
6. Commit the slice atomically.

## Context cap
- Keep working context **≤ 40% (hard cap 50%)**. When approaching: dispatch a subagent for
  exploration, `/compact`, or `/clear` after writing `.helm/handoff.md`.

## Mid-phase changes (Change Request protocol)
- Freeze & save → classify (add/edit/drop + blast radius) → route:
  small/in-slice = fold in; touches PRD/architecture = **spec-first** (update PRD/mockup, then
  re-plan affected slices); future-only = log to `.helm/ISSUES.md`. Dropping a feature deletes
  its code + tests + routes and re-indexes — no orphan code.

## Self-evolve (confirm-gated)
- When you learn a durable lesson, append it to `.helm/LEARNINGS.md` and show the user
  *"Lesson: X / Proposed rule update: Y / Confirm?"* — apply only on confirm. Snapshot Helm
  core (`node bin/helm.js snapshot`) before any core change.

## Advancing
- When the PRD's slices are all built and green, run `node bin/helm.js advance` to move to Ship.
