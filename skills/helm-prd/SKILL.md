---
name: helm-prd
description: Helm Phase 1 — turn the validated idea into a best-practice, AI-consumable PRD. Tech & infra options are ranked by expected #users and budget. Produces .helm/PRD.md.
---

# Phase 1 — PRD

Goal: a spec that is the source of truth for everything built later. Write it so an
AI coding agent can execute it without guessing.

## Steps
1. Copy `templates/PRD.md` to `.helm/PRD.md` if absent. Set phaseStatus in_progress.
2. Fill it WITH the user, one section at a time (match `comms` style):
   - Problem, target users, scope, and explicit **non-goals** (state what NOT to build).
   - Ask expected **#users** and **budget**, then present **2–3 ranked tech + infra options**
     (e.g. MVP-cheap managed stack vs production stack) each with the *why*.
   - **Machine-verifiable acceptance criteria** (quantified, checkbox-style) per feature.
   - Break scope into phases of ~30–50 requirements; each item has a testable "done".
3. Record key tech/infra decisions in `.helm/DECISIONS.md`.
4. When the user approves the PRD, run `node bin/helm.js advance` to move to Mockup.

## Rules
- No vague criteria ("fast", "intuitive"). Quantify everything.
- Spec is the source of truth: later code follows this PRD, never the reverse.

## Context & memory (always)
- This phase's memory = `.helm/PRD.md` + `state.json` + `DECISIONS.md`. Keep them current — they survive a `/clear`.
- Rehydrate from `.helm/VALIDATION.md` (the conclusions), not the validation chat.
- Keep working context **≤ 40% (hard 50%)**; if approaching, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`. After advancing, `/clear` so the Mockup phase starts fresh.
