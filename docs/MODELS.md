# Helm — Model Setup Guide

> **For the AI agent:** this is an executable guide. Follow it to configure the model role
> slots for a Helm project — typically **Opus plans, Kimi K2.6 builds, Opus reviews** — with the
> coder model running **inside Claude Code** (never a separate CLI). Speak to the user in plain
> language and run the commands for them; only ask for the things only they can provide (API keys,
> which approach they prefer).

## Principle

Kimi (or any cheap coder model) must run **through Claude Code**, so Helm's skills, hooks, and
`.helm/` memory all keep working. We do **not** use a separate Kimi CLI — that would be a different
agent with none of Helm's orchestration.

Helm treats models as **slots** in `.helm/helm.config.json`:

```json
"models": { "plan": "claude-opus", "build": "kimi-k2.6", "review": "claude-opus" }
```

The slot is just a label that tells the agent which "hat" it's wearing. The *actual* model is
selected by how Claude Code is launched (env vars) or by the router's active model.

## Prerequisites (ask the user)

1. A **Moonshot** account + API key with credits → https://platform.moonshot.ai (global) or
   https://platform.moonshot.cn (China). Kimi is cheap (~$0.60 in / $2.50 out per 1M tokens).
2. The current **Kimi coding model id** (e.g. `kimi-k2.6`) — confirm it in the Moonshot console,
   model ids change.
3. Their existing Claude (Opus) access for the plan/review slots.

---

## Method A — Env-var swap (recommended: zero extra tools, most reliable)

Kimi exposes an **Anthropic-compatible endpoint**, so Claude Code talks to it natively (tool use,
file edits, and bash all work). You run Claude Code in "Kimi mode" by setting three env vars.

**PowerShell (Windows):**
```powershell
$env:ANTHROPIC_BASE_URL  = "https://api.moonshot.ai/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "<moonshot-api-key>"
$env:ANTHROPIC_MODEL      = "kimi-k2.6"
# optional: keep background/small calls on Kimi too
$env:ANTHROPIC_SMALL_FAST_MODEL = "kimi-k2.6"
claude   # this Claude Code session now builds with Kimi
```

**bash/zsh (macOS/Linux):**
```bash
export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
export ANTHROPIC_AUTH_TOKEN="<moonshot-api-key>"
export ANTHROPIC_MODEL="kimi-k2.6"
export ANTHROPIC_SMALL_FAST_MODEL="kimi-k2.6"
claude
```

**Back to Opus** for planning/review: open a **new terminal without those vars** (or unset them)
and run `claude` — that session uses your normal Claude/Opus.

> ⚠️ The swap is **global to a session** — you can't mix Opus and Kimi in the *same* window.
> That's fine for Helm because the build loop is phased.

### How to run the plan → build → review loop with env-swap
Helm's `.helm/` memory + on-disk plan files are the handoff between the two sessions:

1. **Plan (Opus session):** plan the next slice; write the plan into `.helm/` (or a plan file).
2. **Build (Kimi session):** in the Kimi-env terminal, open the same project and implement the
   plan. Commit.
3. **Review (Opus session):** back in the Opus terminal, review + auto-fix the diff.
4. Repeat per slice. (Two terminals open side-by-side is the smoothest.)

---

## Method B — Claude Code Router (single window, live switching)

If the user wants Opus and Kimi **in one window**, use the router proxy.

```bash
npm install -g @musistudio/claude-code-router
# Configure ~/.claude-code-router/config.json (see the router's README for the current schema):
#   - a provider "anthropic" with their Opus key
#   - a provider "moonshot" with base url https://api.moonshot.ai/anthropic and the Kimi key
ccr code      # launches Claude Code through the router
```

Inside the session, switch the active model per Helm phase:
```
/model anthropic,claude-opus-<id>     # plan + review slots
/model moonshot,kimi-k2.6             # build slot
```

> The router's config schema evolves — **follow its README** (github.com/musistudio/claude-code-router)
> for exact field names. Method A is more stable; prefer it unless the user wants single-window.

---

## Update Helm's slots

Set the slots so Helm knows the intended roles (the agent reads these to pick its "hat"):

```json
// .helm/helm.config.json
"models": { "plan": "claude-opus", "build": "kimi-k2.6", "review": "claude-opus" }
```

Record the choice in `.helm/DECISIONS.md`.

## Verify it works

In the Kimi session, ask a tiny question and confirm a sane response, then confirm tool use by
having it read a file. If you get a **401**, the key/endpoint is wrong; **model not found** → wrong
model id; **tool/diff errors** → make sure you used the `/anthropic` endpoint, not the plain
OpenAI-style one.

## Caveats & security

- **Billing splits:** Opus calls bill to Anthropic, Kimi calls bill to Moonshot (cheap). Two keys.
- 🔑 **Never commit keys.** Use env vars or a **git-ignored** `.env`; this is one of Helm's loud
  ship gates.
- Always do the **final review with the strong model (Opus)** — never ship cheap-model output
  unreviewed.
- Any cheap strong coder (DeepSeek, GLM, Qwen) can replace Kimi the same way — just swap the
  provider/base-url/model id. The slots stay the same.
