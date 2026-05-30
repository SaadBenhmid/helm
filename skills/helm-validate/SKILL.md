---
name: helm-validate
description: Helm Phase 0 — validate a SaaS idea on market demand and cost BEFORE building. Produces .helm/VALIDATION.md with a go / pivot / kill decision.
---

# Phase 0 — Validate

Goal: a defensible **go / pivot / kill** decision, recorded in `.helm/VALIDATION.md`,
before any PRD or code.

## Steps

1. Copy `templates/VALIDATION.md` to `.helm/VALIDATION.md` if it does not exist.
2. Set `phaseStatus` to `in_progress`: edit `.helm/state.json` or guide via questions.
3. Work through the template WITH the user, one topic at a time (match `comms` style):
   - One-line idea, then an *uncomfortably specific* target user.
   - Three falsifiable hypotheses (customer, problem, willingness-to-pay).
   - Bottom-up TAM/SAM/SOM + 3–5 competitors.
   - Rough monthly infra cost: MVP-cheap vs production, and whether it fits budget.
   - A go / pivot / kill threshold — **set before judging**.
4. Record the decision + rationale in `.helm/VALIDATION.md`.
5. Log the decision in `.helm/DECISIONS.md`.
6. When the user confirms the decision, run `node .helm/runtime/bin/helm.js advance` to move to
   the PRD phase.

## Rules

- This is a soft gate: if validation is weak, say so loudly, but the user may
  choose to proceed (their call).
- Keep it cheap and fast. Evidence over opinion. Don't start building here.

## Context & memory (always)
- This phase's memory = `.helm/VALIDATION.md` + `state.json` + `DECISIONS.md`. Keep them current — they survive a `/clear`.
- Keep working context **≤ 40% (hard 50%)**; if approaching, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`. After advancing, `/clear` so the PRD phase starts fresh and rehydrates from `.helm/` — the validation chat does not carry forward.
