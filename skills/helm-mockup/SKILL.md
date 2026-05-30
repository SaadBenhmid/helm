---
name: helm-mockup
description: Helm Phase 2 — turn the PRD into a confirmed mockup, then a reusable component template, then a locked design identity (.helm/DESIGN.md).
---

# Phase 2 — Mockup → Reusable Template

Goal: the user "finishes the product in their mind" visually, and the AI captures a
consistent, reusable design system.

## Steps
1. Build a mockup using the user's chosen tool (`mockupTool` slot — Claude Artifacts /
   Stitch / Lovable / Onlook). Use mock data.
2. **User confirms the mockup matches their vision.**
3. Convert the confirmed mockup into a **reusable template**: shared components, design
   tokens, layout primitives (not throwaway screens).
4. **User confirms the template matches the mockup.**
5. Write `.helm/DESIGN.md` from `.helm/runtime/templates/DESIGN.md`: colors, typography, spacing,
   component rules, tone/voice. Every later coding step reads this so the UI never drifts.
6. Run `node .helm/runtime/bin/helm.js advance` to move to Setup.

## Rules
- Do not proceed until BOTH confirmations are given.
- The template is reused everywhere — fixing it once fixes it everywhere (fewer tokens).

## Context & memory (always)
- This phase's memory = `.helm/DESIGN.md` + the component template + `state.json`. Keep them current — they survive a `/clear`.
- Rehydrate from `.helm/PRD.md`, not the PRD chat.
- Keep working context **≤ 40% (hard 50%)**; if approaching, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`. After advancing, `/clear` so the Setup phase starts fresh.
