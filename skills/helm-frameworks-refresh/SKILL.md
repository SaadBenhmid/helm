---
name: helm-frameworks-refresh
description: Re-research the AI-workflow-framework market and rewrite .helm/frameworks.json so Helm's setup recommendations stay current. Use when the registry is stale (helm frameworks warns) or the user asks to update framework knowledge.
---

# Refresh the framework registry

Helm recommends an AI-workflow framework at Setup from `.helm/frameworks.json`. That file is
market knowledge and **goes stale** — this skill brings it back up to date. Only the agent can
browse the web, so the *CLI* just reads/ranks/flags-staleness; the *refresh* is this skill.

## When to run
- `helm frameworks` printed a "⚠ Registry may be stale" warning, **or**
- the user asks to update / re-check the framework landscape, **or**
- you're at Setup and `lastVerified` is more than ~4 months old.

## Steps
1. **Read the current registry** at `.helm/frameworks.json` (fall back to the package
   `templates/frameworks.json`). Note its `schema` and `lastVerified`.
2. **Research the market.** Use real web research (the `firecrawl` / `deep-research` skills or
   web search) for current (this year) **AI coding *workflow* frameworks** — the methodology /
   orchestration systems that drive how an agent builds software (phases, planning, memory, TDD,
   review). These are NOT web frameworks (React/Next) and NOT LLM app frameworks (LangChain).
   Cover at least the existing entries plus search for newcomers. For each, verify it still
   exists / is maintained — **drop anything you cannot verify.** Prefer primary sources
   (repos/docs) over listicles.
3. **Rewrite `.helm/frameworks.json`** preserving the exact schema. Each framework entry needs:
   `id`, `name`, `url`, `bestFor` (one sentence), `pros` (2–4 concrete, sourced bullets),
   `cons` (2–4), `fit` `{ size:{small,medium,large: best|ok|poor}, rigor: low|medium|high,
   ui: low|medium|high, team:{solo,team: best|ok|poor} }`, and `sources` (1–3 URLs). Keep the
   `guidance` array (4–6 rules of thumb) current. Always include the `raw-claude-code` baseline.
4. **Bump `lastVerified`** to today's date (YYYY-MM-DD).
5. **Validate**: run `node bin/helm.js frameworks` — it must load without error and list the new
   set. Fix any schema issue it reports.
6. **Summarise** for the user what changed (added / removed / re-rated), and record a one-line
   entry in `.helm/DECISIONS.md` (e.g. "Refreshed framework registry — added X, dropped Y").

## Rules
- Accuracy over completeness. A wrong "pro/con" is worse than omitting a framework.
- Keep entries concise — this file is read every Setup; it is not an essay.
- Never invent URLs or stars/benchmarks; cite what you actually found.
- This is a normal (non-critical) action — no user confirmation needed to refresh knowledge,
  but the framework *choice* at Setup still belongs to the user.
