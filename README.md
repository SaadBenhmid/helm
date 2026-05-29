# Helm ⛵ — v1 (Foundation)

**Helm is an auto-bootstrapping meta-orchestrator for building a production-grade SaaS with AI coding tools** (Claude Code or any AI agent).

It is *not* a framework. It orchestrates the best framework + tools for your project and manages the whole journey around them: idea → validation → PRD → mockup → build → ship. Any new AI session auto-reads Helm's state, instantly knows where the project is, and tells you the next step — no memory loss, no re-explaining.

> 📍 **status (v1.1):** The Foundation **plus all six journey phases** are wired into the brain — Validate → PRD → Mockup → Setup → Build → Ship — with `helm advance` to move between them. A few runtime automations remain (see "Still ahead").

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

From your project folder:

```bash
# 1. Initialize Helm (creates the .helm/ memory folder)
node bin/helm.js init

# 2. Ask Helm where you are and what's next
node bin/helm.js status
```

`status` prints something like:

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
| `helm init` | Create `.helm/` with default `state.json` + `helm.config.json`. |
| `helm status` | Show current phase, status, and the next action. (alias: `helm next`) |
| `helm advance` | Mark the current phase complete and move to the next one. |
| `helm snapshot [label]` | Snapshot Helm's core files (returns a snapshot id). |
| `helm rollback [id]` | Restore from a snapshot (latest if no id given). |

> In v1 you run these as `node bin/helm.js <command>`. (A global `helm` shortcut comes later.)

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
  render.js                 # state -> human-readable status text
  snapshot.js               # snapshot + rollback safety
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

- **models** — the cost-saving pattern: plan with a smart model, build with a cheap strong one, review with a smart one. Fully swappable (all-Claude, Opus+GLM+GPT, etc.).
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
| 💡 Validate | `helm-validate` | Market + cost check → go / pivot / kill (`VALIDATION.md`) |
| 📋 PRD | `helm-prd` | Best-practice spec; tech/infra options ranked by #users + budget (`PRD.md`) |
| 🎨 Mockup → Template | `helm-mockup` | Confirmed mockup → reusable component template → `DESIGN.md` identity |
| 🧱 Setup | `helm-setup` | Pick framework + install Serena indexer + set model role slots |
| 🔁 Build loop | `helm-build` | Slice-by-slice plan→build→review, context cap, CR protocol, self-evolve |
| 🚢 Ship | `helm-ship` | Production checklist + loud gates on secrets / data-loss / auth (`SHIP.md`) |

### Still ahead (future hardening)
- Runtime context-meter + auto-compact automation (currently rule-guided).
- A global `helm` shortcut + framework-selection scoring + smoke-test-on-copy for self-evolve.

---

## Testing

```bash
node --test
```

v1.1 ships **38 tests** across state, advance, config, router, render, snapshot, CLI, skills, phase skills, and end-to-end routing.
