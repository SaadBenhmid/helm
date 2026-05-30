# Helm ⛵ — v1 (Foundation)

**Helm is an auto-bootstrapping meta-orchestrator for building a production-grade SaaS with AI coding tools** (Claude Code or any AI agent).

It is *not* a framework. It orchestrates the best framework + tools for your project and manages the whole journey around them: idea → validation → PRD → mockup → build → ship. Any new AI session auto-reads Helm's state, instantly knows where the project is, and tells you the next step — no memory loss, no re-explaining.

> 📍 **status (v1.4):** Works on **new *and* existing projects**, with **hook-enforced memory**. Install with one command (`npx github:SaadBenhmid/helm init`). New projects walk Validate → PRD → Mockup → Setup → Build → Ship; existing projects start with **Adopt** then loop **PRD → Build → Ship** per milestone. Claude runs every command; you only confirm phase moves. **Autopilot:** `init` auto-installs memory hooks, so context survives auto-compaction with zero user action — stay in one session and Claude manages context/memory silently.

---

## What v1 gives you

| Piece | What it does |
|-------|--------------|
| 🧠 **The brain** | A `helm status` command + bootstrap skill. Every new session reads project state and routes you to the exact next action. |
| 💾 **Memory** | `.helm/state.json` (where you are) + `DECISIONS.md`, `ISSUES.md`, `handoff.md` templates so context survives across sessions. |
| ⚙️ **Config (slots)** | `.helm/helm.config.json` holds swappable slots: framework, model roles (`plan`/`build`/`review`), mockup tool, code indexer, context caps, comms style, strictness. |
| 🛡️ **Safety net** | `helm snapshot` / `helm rollback` — version Helm before any self-change so nothing can ever be bricked. |
| 💡 **P0 Validate** | A guided phase that pressure-tests your SaaS idea on market + cost and records a **go / pivot / kill** decision in `.helm/VALIDATION.md` before any building. |

---

## Requirements

- **Node.js** v18+ (developed on v24). No other dependencies.
- **Git** (recommended) for versioning your project.

---

## Quick start

One command in your project folder:

```bash
npx github:SaadBenhmid/helm init
```

That installs Helm's brain, runtime, phase skills, and `CLAUDE.md` into the folder and creates
the `.helm/` memory directory. Then open the folder in **Claude Code** (or any AI agent) and just
talk — Claude runs every Helm command for you (locally, via `node bin/helm.js …`), and the only
thing it asks is for you to **confirm moving between phases**.

Behind the scenes Claude runs `helm status`, which prints something like:

```
# Helm — Project State

- **Current phase:** validate
- **Status:** not_started
- **Updated:** 2026-05-29T...

## Next action

You're in phase "Validate" (not_started). Run the market + cost validation.
Produce a clear go / pivot / kill decision recorded in .helm/VALIDATION.md.
```

Then let your AI agent invoke the **helm-validate** skill to walk you through Phase 0.

👉 **New here?** See [docs/USAGE.md](docs/USAGE.md) for a full walkthrough — a real-feeling Claude conversation building a SaaS from an empty folder to ship.

---

## CLI commands

| Command | What it does |
|---------|--------------|
| `npx github:SaadBenhmid/helm init` | One-time: install Helm (runtime + skills + CLAUDE.md) into the current project and create `.helm/`. |
| `node bin/helm.js status` | Show current phase, status, and the next action. (alias: `next`) |
| `node bin/helm.js advance` | Mark the current phase complete and move to the next one. |
| `node bin/helm.js snapshot [label]` | Snapshot Helm's core files (returns a snapshot id). |
| `npx github:SaadBenhmid/helm init --existing` | One-time: adopt an **existing** codebase (starts at the Adopt phase). |
| `node bin/helm.js milestone` | Start the next feature/fix milestone (loops back to a fresh PRD). |
| `node bin/helm.js hooks install` | Wire Claude Code hooks so memory is captured automatically. |
| `node bin/helm.js models init` | Scaffold git-ignored `.env.helm` + launcher scripts for the Kimi build model. |
| `node bin/helm.js lint` | Health-check `.helm/` memory (missing logs, stale/out-of-order state). |
| `node bin/helm.js rollback [id]` | Restore from a snapshot (latest if no id given). |

> **You don't type these — Claude does.** After the one-time `npx github:…` install, the runtime
> lives locally so the AI runs everything with `node bin/helm.js …` and only asks you to confirm
> phase transitions.

---

## How a session works

1. Your AI session starts. `CLAUDE.md` tells it: **invoke `helm-bootstrap` first**.
2. The bootstrap skill runs `helm status` and reads the routing output.
3. It announces in plain language: *"You're on phase X. Next: Y."*
4. It invokes the matching phase skill (e.g. `helm-validate`) to do the work.
5. Before context fills up or the session ends, it writes `.helm/handoff.md` so the next session resumes cleanly.

This is what makes Helm **self-driving** across sessions.

---

## Project layout

```
bin/helm.js                 # CLI entry point
src/
  state.js                  # read/write/validate .helm/state.json
  config.js                 # read/validate .helm/helm.config.json + defaults
  router.js                 # the brain: state -> next action
  render.js                 # state -> status + handoff text
  snapshot.js               # snapshot + rollback safety
  hooks.js                  # Claude Code hook wiring (SessionStart/End, PreCompact)
  lint.js                   # memory-integrity checks
skills/
  helm-bootstrap/SKILL.md   # auto-read entry skill (routes every session)
  helm-validate/SKILL.md    # P0 Validate phase guide
templates/
  helm.config.json          # default config (the slots)
  DECISIONS.md              # why-we-chose-things log
  ISSUES.md                 # Jira-style known-issues log
  handoff.md                # session handoff note
  VALIDATION.md             # P0 output template
docs/superpowers/
  specs/  ...-helm-...-design.md   # the full design spec
  plans/  ...-helm-foundation.md   # this v1 implementation plan
```

At runtime, Helm creates a `.helm/` folder in your project (git-ignored) holding your live `state.json`, `helm.config.json`, snapshots, and the working docs above.

---

## Config slots (`.helm/helm.config.json`)

Everything is a swappable slot — change any value, Helm adapts:

```json
{
  "slots": {
    "framework": null,
    "models": { "plan": "claude-opus", "build": "kimi-k2.6", "review": "claude-opus" },
    "mockupTool": null,
    "indexer": "serena"
  },
  "contextCapTarget": 40,
  "contextCapHard": 50,
  "comms": "non-technical",
  "strictness": "soft"
}
```

- **models** — the cost-saving pattern: plan with a smart model, build with a cheap strong one, review with a smart one. Fully swappable (all-Claude, Opus+GLM+GPT, etc.). Setup guide for running **Kimi K2.6 as the build model inside Claude Code**: [docs/MODELS.md](docs/MODELS.md) (also embedded in the `helm-setup` skill).
- **contextCap** — keep working context lean (target 40%, hard cap 50%).
- **comms** — how the AI talks to you (`non-technical` / `some-coding` / `experienced`).
- **strictness** — `soft` nudges by default; loud checks reserved for the SaaS-killers (secrets / data-loss / auth).

---

## Safety model

Helm can improve itself, but **the AI can never brick it**:

- 🔒 **Protected core** — self-improvement is *additive only*; it never rewrites core logic. The core is fully editable **by you, the owner** — your call, your responsibility.
- 📸 **Snapshot before change** — `helm snapshot` versions the core; `helm rollback` restores last-known-good (and prunes anything added since).
- 👤 **You confirm** critical actions (core changes, framework swaps, the 3 killers).

See `docs/superpowers/specs/2026-05-29-helm-ai-coding-system-design.md` §10 for the full safety design.

---

## The full journey (all phases shipped)

All six phases are now wired into the brain. `helm advance` moves you through them:

| Phase | Skill | What it does |
|-------|-------|--------------|
| 🔎 Adopt *(existing only)* | `helm-adopt` | Map the codebase → `CODEBASE.md` + Serena index + seeded decisions (read-only) |
| 💡 Validate *(new only)* | `helm-validate` | Market + cost check → go / pivot / kill (`VALIDATION.md`) |
| 📋 PRD | `helm-prd` | Best-practice spec; tech/infra ranked by #users + budget; brownfield = per-milestone scope (`PRD.md`) |
| 🎨 Mockup → Template *(new only)* | `helm-mockup` | Confirmed mockup → reusable component template → `DESIGN.md` identity |
| 🧱 Setup *(new only)* | `helm-setup` | Pick framework + install Serena indexer + set model role slots |
| 🔁 Build loop | `helm-build` | Slice-by-slice plan→build→review, context cap, CR protocol, self-evolve, brownfield guardrails |
| 🚢 Ship | `helm-ship` | Production checklist + loud gates on secrets / data-loss / auth (`SHIP.md`) |

**New project:** Validate → PRD → Mockup → Setup → Build → Ship.
**Existing project:** Adopt → (PRD → Build → Ship) per milestone — run `helm milestone` to start the next one.

### Autopilot memory (hooks)
**`helm init` installs these automatically** — you never run a command or manage context:
- **SessionStart** → `helm inject` re-injects current state into the session.
- **SessionEnd / PreCompact** → `helm capture` writes `.helm/handoff.md` before context is lost.

So you can stay in **one long session**: Claude Code auto-compacts when the window fills, the hooks
make that lossless, and Helm rehydrates from `.helm/`. No `/compact`, no `/clear`, no re-explaining.
(`helm hooks install` re-installs them if needed; `helm lint` health-checks memory.)

### Still ahead (future hardening)
- Background decision/lesson extraction (Karpathy-style "compile") for very large projects.
- A global `helm` shortcut + framework-selection scoring + smoke-test-on-copy for self-evolve.

---

## Testing

```bash
node --test
```

v1.4 ships **78 tests** across state, advance, brownfield (project types + adopt + milestone), config, router, render, snapshot, hooks, lint, CLI, init/asset-install, skills, phase skills, context discipline, and end-to-end routing.
