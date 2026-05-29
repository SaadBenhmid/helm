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
3. If the output says Helm is not initialized, run `node bin/helm.js init` first,
   then re-run status.
4. Announce to the user in plain language: *"You're on phase X. Next: Y."*
5. If the next action names a phase skill (e.g. the Validate phase), invoke that
   skill to carry it out.
6. Before ending a session or clearing context, write `.helm/handoff.md` from the
   template so the next session resumes cleanly.

## Rules

- Communicate in the style set in `.helm/helm.config.json` (`comms`).
- Never silently change Helm's own files. Self-improvements must be shown to the
  user as *"Lesson / Proposed update / Confirm?"* before applying.
- Before any change to Helm core, run `node bin/helm.js snapshot` first.
