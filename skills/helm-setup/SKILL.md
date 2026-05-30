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
   (e.g. Opus plan, Kimi build, Opus review — or all-Claude). Confirm with the user, then
   configure the build model (see "Configure Kimi as the build model" below).
4. Run `node bin/helm.js advance` to move to the Build loop.

## Configure Kimi as the build model (inside Claude Code)

Run the cheap coder model (Kimi K2.6) **through Claude Code** — never a separate CLI — so Helm's
skills, hooks, and `.helm/` memory keep working. Full reference: `docs/MODELS.md`.

Prereqs to ask the user for: a **Moonshot** API key (platform.moonshot.ai — global, or
platform.moonshot.cn) and the current Kimi model id (e.g. `kimi-k2.6`).

**Recommended — env-var swap** (zero extra tools; Kimi has an Anthropic-compatible endpoint):
```powershell
# PowerShell — run Claude Code in "Kimi mode" for the BUILD slot
$env:ANTHROPIC_BASE_URL  = "https://api.moonshot.ai/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "<moonshot-api-key>"
$env:ANTHROPIC_MODEL      = "kimi-k2.6"
claude
```
```bash
# bash/zsh equivalent
export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
export ANTHROPIC_AUTH_TOKEN="<moonshot-api-key>"
export ANTHROPIC_MODEL="kimi-k2.6"
claude
```
- For **plan/review** (Opus), use a separate terminal **without** those vars and run `claude`.
- The two sessions share the project folder + `.helm/` memory + plan files — that's the handoff.
- The swap is global per session (can't mix Opus+Kimi in one window).

**Single-window alternative — Claude Code Router** (`npm i -g @musistudio/claude-code-router`,
`ccr code`, then `/model moonshot,kimi-k2.6` to build and `/model anthropic,<opus>` to plan/review).
Follow the router README for its config schema. See `docs/MODELS.md`.

Rules: never commit keys (use env vars / a git-ignored `.env` — a loud ship gate 🔑); always do
the **final review with Opus**; any cheap coder (DeepSeek/GLM/Qwen) swaps in the same way.

## Rules
- Keep setup near-zero-touch for the user; explain choices in plain language.
- A framework swap mid-project is a critical action: snapshot first, then confirm.

## Context & memory (always)
- This phase's memory = `.helm/helm.config.json` (the slots) + `state.json` + `DECISIONS.md`. Keep them current — they survive a `/clear`.
- Keep working context **≤ 40% (hard 50%)**; if approaching, write `.helm/handoff.md` then `/compact` or `/clear` and re-bootstrap.
- Before `helm advance` (or ending the session), write `.helm/handoff.md`. After advancing, `/clear` so the Build phase starts fresh.
