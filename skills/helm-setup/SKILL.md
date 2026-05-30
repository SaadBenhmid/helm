---
name: helm-setup
description: Helm Phase 3 — pick the framework for this project, install the Serena code indexer, and set the model role slots before building.
---

# Phase 3 — Setup

Goal: configure the engine for *this* project so the build loop runs cleanly and cheaply.

## Steps
1. **Recommend a framework, then let the user pick.** Helm is framework-agnostic at build time
   but advises here. Derive the project's signals from the PRD — **size** (small/medium/large),
   **rigor** (low/medium/high), **ui** weight (low/medium/high), **team** (solo/team) — and run
   `node .helm/runtime/bin/helm.js frameworks --size <s> --rigor <r> --ui <u> --team <t>`. It ranks the
   registry (`.helm/frameworks.json`) with rationale. Present the top 2–3 with their pros/cons,
   **recommend one**, and let the user choose. Record the choice + why in `.helm/DECISIONS.md`.
   If `helm frameworks` warns the registry is stale, run the **helm-frameworks-refresh** skill
   first so the advice reflects the current market. No lock-in: the choice can be swapped later
   (a critical action — needs user confirmation).
2. **Install the code indexer (Serena MCP)** so future sessions navigate by symbol instead of
   re-reading files (40–90% token savings). Add a re-index step to the workflow.
3. **Set the model role slots** in `.helm/helm.config.json`: `plan` / `build` / `review`
   (e.g. Opus plan, Kimi build, Opus review — or all-Claude). Confirm with the user, then
   configure the build model (see "Configure Kimi as the build model" below).
4. Run `node .helm/runtime/bin/helm.js advance` to move to the Build loop.

## Configure Kimi as the build model (inside Claude Code)

Run the cheap coder model (Kimi K2.6) **through Claude Code** — never a separate CLI — so Helm's
skills, hooks, and `.helm/` memory keep working. Full reference: `docs/MODELS.md`.

Prereqs to ask the user for: a **Moonshot** API key (platform.moonshot.ai — global, or
platform.moonshot.cn) and the current Kimi model id (e.g. `kimi-k2.6`).

**Recommended — env-var swap, persisted once** (zero extra tools; Kimi has an Anthropic-compatible
endpoint). Set it up so the user never re-enters the key:

1. Run `node .helm/runtime/bin/helm.js models init` — this scaffolds `.env.helm.example`, two launcher scripts
   (`scripts/helm-kimi.ps1` / `.sh`), and adds **`.env.helm` to `.gitignore`**.
2. Ask the user for their Moonshot key, then **write `.env.helm`** (copy `.env.helm.example` and
   fill `ANTHROPIC_AUTH_TOKEN`; confirm `ANTHROPIC_MODEL` is the current Kimi id). Never commit it.
3. To **build with Kimi**, the user launches Claude Code via the launcher (it loads `.env.helm`):
   - Windows: `pwsh scripts/helm-kimi.ps1`  ·  macOS/Linux: `bash scripts/helm-kimi.sh`
4. For **plan/review** (Opus), just run `claude` in a normal terminal (no Kimi env).

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
