---
name: helm-setup
description: Helm Phase 3 — pick the framework for this project, install the Serena code indexer, and set the model role slots before building.
---

# Phase 3 — Setup

Goal: configure the engine for *this* project so the build loop runs cleanly and cheaply.

## Steps
1. **Pick the framework** best suited to this project (GSD / Superpowers / BMAD / etc.)
   based on the PRD. Record the choice + why in `.helm/DECISIONS.md`. No lock-in: it can be
   swapped later (a critical action — needs user confirmation).
2. **Install the code indexer (Serena MCP)** so future sessions navigate by symbol instead of
   re-reading files (40–90% token savings). Add a re-index step to the workflow.
3. **Set the model role slots** in `.helm/helm.config.json`: `plan` / `build` / `review`
   (e.g. Opus plan, Kimi build, Opus review — or all-Claude). Confirm with the user.
4. Run `node bin/helm.js advance` to move to the Build loop.

## Rules
- Keep setup near-zero-touch for the user; explain choices in plain language.
- A framework swap mid-project is a critical action: snapshot first, then confirm.
