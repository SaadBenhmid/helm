---
name: helm-bootstrap
description: Use at the start of EVERY session in a Helm-managed project. Reads project state and routes to the correct next action. Invoke before any other work.
---

# Helm Bootstrap

You are operating inside a Helm-managed project. Your job right now is to find
out where the project is and what to do next — do not improvise.

## Steps

1. Run the status command from the project root:
   `node bin/helm.js status`  (or `helm status` if Helm is linked globally)
2. Read the output. It tells you the **current phase**, **status**, and the
   **next action**.
3. If the output says Helm is not initialized, **ask the user one question first**:
   *"Is this a brand-new project, or an existing codebase you're adding to?"*
   - New → `node bin/helm.js init`
   - Existing → `node bin/helm.js init --existing` (starts at the **Adopt** phase so we
     understand the code before changing it).
   Then re-run status.
4. **Rehydrate cheaply.** Load only the small `.helm/` files you need for this phase:
   `state.json`, the current phase's artifact (e.g. `VALIDATION.md`, `PRD.md`), and
   `handoff.md` if it exists. Do **not** re-read earlier phases' conversations — their
   conclusions are already captured in their artifacts.
5. Announce to the user in plain language: *"You're on phase X. Next: Y."*
6. If the next action names a phase skill (e.g. the Validate phase), invoke that
   skill to carry it out.
7. **Between phases:** after a phase finishes and you run `node bin/helm.js advance`,
   write `.helm/handoff.md`, then `/clear` and re-invoke this skill — the next phase
   starts with a fresh context and rehydrates from `.helm/`.
8. Before ending a session or clearing context, always write `.helm/handoff.md` from the
   template so the next session resumes cleanly.

## Rules

- Communicate in the style set in `.helm/helm.config.json` (`comms`).
- Never silently change Helm's own files. Self-improvements must be shown to the
  user as *"Lesson / Proposed update / Confirm?"* before applying.
- Before any change to Helm core, run `node bin/helm.js snapshot` first.
