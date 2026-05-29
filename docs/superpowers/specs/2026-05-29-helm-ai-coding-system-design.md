# Helm — Design Spec

> Working name: **Helm** ⛵ (rename freely)
> Date: 2026-05-29
> Status: Design approved, ready for implementation plan

---

## 1. What Helm is

Helm is an **auto-bootstrapping meta-orchestrator** for building a production-grade SaaS with AI coding tools (Claude Code or any AI agent).

It is **not** a framework. It *orchestrates* the best framework + tools for each project, and manages the full journey around them: idea → validation → PRD → mockup → build → ship.

Any new AI session auto-reads Helm's state, instantly knows where the project is, and runs the right next step. No memory loss, no re-explaining.

## 2. Who it's for

- **Primary user: a non-coder / vibe-coder** who drives with prompts and cannot reliably review code.
- Therefore: the system speaks plain language (no jargon), and *proves* quality with automated checks rather than asking the user to inspect code.
- The system asks the user's coding level + preferred communication style at setup and adapts tone accordingly.

## 3. Core principles

1. **Spec is the source of truth.** Code follows spec — never the reverse. A change is "real" only once the PRD/roadmap reflect it.
2. **Auto-detect & self-drive.** Every session bootstraps from state and proposes the next action.
3. **Everything is a swappable slot.** Framework, model roles, mockup tool, code indexer are all configurable — never hardcoded.
4. **Soft nudges, loud on killers.** Most gates are advisory; checks are loud and hard to ignore for the three SaaS-killers: leaked secrets 🔑, data loss 🗑️, broken auth 🔓. User can override with confirmation.
5. **Token economy is a first-class concern.** Context capped, models tiered, code indexed so sessions don't re-read everything.
6. **Self-evolving.** Each session captures lessons and updates Helm's own rules for better future performance.
7. **Production, not MVP.** Defaults aim at a real, scalable SaaS — while still offering a fast/cheap path when the user picks it.

## 4. Architecture

### 4.1 The brain (auto-detect + route)
- A root `CLAUDE.md` + a Helm entry skill that every new session auto-reads.
- It reads `STATE.md` → determines the current phase → tells the user the next action.
- Result: continuity across sessions, `/clear`, and rate-limit interruptions.

### 4.2 The journey — 6 soft-gated phases

**P0 — Validate** 💡
- Market + cost/feasibility check before building.
- Falsifiable hypotheses (customer, problem, willingness-to-pay), specific target user, bottom-up TAM/SAM/SOM, 3–5 competitors.
- A **go / pivot / kill** threshold set *before* testing.
- Rough infra cost estimate.
- Output: `VALIDATION.md` + go/no-go decision.

**P1 — PRD** 📋
- Best-practice, AI-consumable PRD (spec-as-contract).
- Sections: Problem → Users → Scope (+ explicit non-goals) → Tech stack (+ rationale) → Infra (+ rationale) → Architecture patterns → Acceptance criteria (machine-verifiable) → Success metrics.
- Asks **expected #users + budget**, then presents **2–3 ranked options** (e.g. MVP-cheap stack vs production stack) with the *why* for each.
- Phased: broken into chunks of ~30–50 requirements; each item has a testable "done."
- Output: `PRD.md`.

**P2 — Mockup → Reusable template** 🎨
1. Build mockup (pluggable tool: Claude Artifacts / Stitch / Lovable / Onlook — user's choice).
2. User confirms the mockup matches their vision.
3. AI converts the confirmed mockup into a **reusable template** — a real design system: shared components, design tokens, layout primitives (not throwaway).
4. **User confirms the template matches the mockup.**
5. Helm writes `DESIGN.md` — the **design identity** (colors, typography, spacing, component rules, tone/voice). Every coding step reads it so the SaaS stays visually consistent and never drifts.
6. Only then → next phase.
- Why: every later screen reuses these components → consistent UI, fewer tokens, no rebuilding the same element repeatedly.
- Output: `MOCKUP/` + component template + `DESIGN.md` + sign-off in `STATE.md`.

**P3 — Setup** 🧱
- Pick the framework best suited to *this* project (GSD / Superpowers / BMAD / etc.) — selection logic, not a fixed choice.
- **No lock-in:** if the chosen framework underperforms mid-build, Helm may propose swapping it for a better one — or rolling its own. Because this touches the engine, a framework swap is a **critical action requiring user confirmation** (see §10).
- Install code indexer (Serena MCP) + configure re-index step.
- Configure **model role slots** (see 4.4).
- Configure communication style + strictness.
- Output: `helm.config` populated.

**P4 — Build loop** 🔁
- Work in small vertical slices.
- Per slice: **plan → build → review** using the configured model roles.
- After each slice: run checks (tests + the 3 killer scans), update memory, re-index, atomic commit.
- Context kept under the cap (see 4.3) via subagents/compact/clear.

**P5 — Ship** 🚢
- Production-readiness checklist.
- Loud gates on secrets / data-loss / auth.
- Output: deployable build + `SHIP.md` checklist record.

### 4.3 Always-on layers (run under every phase)

- **💾 Memory** — `STATE.md` (where we are), handoff notes (written before context resets), `DECISIONS.md` (why we chose things).
- **🧠 Context budget** — target **≤ 40%**, hard cap **50%**. On approach: spin up subagents for exploration, `/compact`, or `/clear` with a handoff note.
- **🪙 Token economy** — modular model roles (4.4); warns the user *before* hitting usage/rate limits; prefers cheap models + prompt caching for grunt work.
- **🗂️ Code map** — Serena MCP gives symbol-level navigation so sessions don't re-read files (40–90% token savings). Re-index after structural changes.
- **🎫 Known-issues log** — `ISSUES.md`, Jira-style. Records solved bugs + their fixes + open items so the AI never re-solves a solved problem and tracks deferred work.
- **🛡️ Quality** — soft nudges everywhere; loud, hard-to-skip checks on the 3 killers.
- **🔄 Self-evolve (confirm-gated)** — at session/phase end, capture lessons learned and propose rule updates. Helm **never changes itself silently**: it shows the user *"📚 Lesson: X. 🔧 Proposed update: Y. Confirm / Decline?"* and only applies on confirm. See §10 for the safety model that guarantees self-evolve cannot brick Helm.

### 4.4 Model role slots (modular)

Helm defines **roles**, not models. User fills each slot:

| Role | Default | Alternatives |
|------|---------|--------------|
| `plan` | Claude Opus | any strong reasoner |
| `build` | Kimi K2.6 (cheap, Anthropic-compatible endpoint, runs natively in Claude Code via env vars) | Sonnet, GLM, DeepSeek, Qwen — or "all-Claude" |
| `review` | Claude Opus | GPT, or any strong reviewer |

- Pattern: **plan (smart) → build (cheap) → review + auto-fix (smart)** for best quality-per-token.
- Fully swappable: user can run all-Claude (opusplan), or Opus-plan / GLM-build / GPT-review, etc.
- Final reviewer should always be a strong model; never ship cheap-model output unreviewed.

## 5. Change Request (CR) protocol — mid-phase interruptions

When the user interrupts to **add / edit / drop** a feature while building:

1. **Freeze & save** 💾 — commit/stash current work + write a handoff note. Nothing is lost.
2. **Classify** 🏷️ — add / edit / drop, and blast radius: touches PRD? mockup/template? current slice? future slices?
3. **Route** 🚦
   - 🟢 Small & within current slice → fold in now.
   - 🟡 Touches PRD/architecture → **spec-first**: pause coding → update PRD + mockup → re-plan only affected slices → resume. (Approved default.)
   - 🔵 Future-only → log to backlog/`ISSUES.md`, keep building current slice.
4. **Keep clean** 🧹
   - Drop a feature → delete its code + tests + routes, close its issues, re-index. No orphan code.
   - Every change updates PRD + roadmap + `DECISIONS.md` so docs never drift from reality.
   - Re-index code map after structural changes.

## 6. Config (`helm.config`)

A single file holds all the slots: chosen framework, model roles, mockup tool, indexer, strictness level, communication style, context cap. Swap anything, anytime — Helm adapts.

## 7. Borrowed best ideas (provenance)

- **GSD** — fresh-context phase chain + `.planning/`-style on-disk memory.
- **Superpowers** — brainstorm → plan → TDD/verify → review discipline; self-improving skills.
- **OpenSpec / Spec Kit** — spec-as-contract, delta specs, project "constitution."
- **BMAD** — deep PRD/architecture rigor.
- **GStack** — production roles (security/QA/ship).
- **Taskmaster** — PRD → dependency-aware task graph.
- **Serena MCP** — token-saving code map.
- **Kimi K2.6 Anthropic-compatible endpoint** — cheap native execution model.

## 8. Non-goals (for now)

- Not building a new IDE or GUI — Helm runs inside existing AI coding tools.
- Not a hosted service — it's local files + skills + config.
- Not replacing the underlying frameworks — it orchestrates them.

## 9. Open questions for implementation planning

- Exact on-disk layout (`.helm/` vs `.planning/` reuse).
- Framework-selection decision logic (rules vs scored matrix).
- How self-evolve writes rules without bloating context.
- Setup/onboarding flow for non-coder (API keys, MCP install) — must be near-zero-touch.

## 10. Self-modification safety (protecting Helm from itself)

The risk: Helm's self-evolve (or a framework swap) corrupts Helm and bricks the whole system. The model separates **two actors** — the AI is locked out of the core, but the user owns it fully:

- **Self-evolve (the AI)** 🔒 — can *never* modify the core. This is the guarantee that prevents auto-bricking.
- **The user** 🔓 — may edit the core **anytime, at their own discretion and responsibility**, via an explicit override. Helm snapshots first (layer 2) so even a user edit is reversible.

Five layers ensure self-evolve can *improve* Helm but structurally *cannot* break it:

1. **Protected core 🔒** — the brain (bootstrap, state-reader, the safety rules in this section) is **immutable to self-evolve**, but **fully editable by the user**. "Protected" means protected *from the AI*, not from the owner. Self-improvement writes only to an **additive learnings/rules layer**, never to core logic.
2. **Snapshot before every self-change 📸** — Helm versions itself (git tag / backup) before applying any change to itself. One command — `helm rollback` — restores the last-known-good version.
3. **Smoke-test before applying ✅** — a proposed self-change is validated on a *copy* first (does it still boot? read `STATE.md`? resolve all phases?). If the test fails, the change is auto-rejected and never goes live. (Superpowers' "TDD for skills" pattern.)
4. **User confirmation 👤** — any change that touches Helm's core, rules, or chosen framework requires explicit user OK before it is applied.
5. **Safe mode 🚑** — if the brain ever fails to load, Helm boots a minimal recovery mode whose only job is to restore the last good snapshot.

**Critical actions (always require user confirmation):** self-evolve rule changes, framework swaps, anything touching the protected core, and the 3 SaaS-killers (secrets / data-loss / auth).

Net effect: self-evolve is **additive + reversible + tested + confirmed**.
