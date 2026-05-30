// Claude Code hook wiring so context/memory management is enforced by the harness,
// not left to the agent's discipline:
//   SessionStart -> inject Helm state into the new session
//   SessionEnd / PreCompact -> capture a handoff before context is lost

const DEFAULT_RUNNER = "node bin/helm.js";

export function helmHooks(runner = DEFAULT_RUNNER) {
  return {
    SessionStart: [{ hooks: [{ type: "command", command: `${runner} inject` }] }],
    SessionEnd: [{ hooks: [{ type: "command", command: `${runner} capture --reason session-end` }] }],
    PreCompact: [{ hooks: [{ type: "command", command: `${runner} capture --reason precompact` }] }],
  };
}

function hasHelmCommand(group, runner) {
  if (!group || !Array.isArray(group.hooks)) return false;
  return group.hooks.some((h) => typeof h.command === "string" && h.command.includes(runner));
}

// Merge Helm's hooks into an existing settings object without clobbering other
// hooks or settings. Idempotent: running twice does not duplicate Helm entries.
export function mergeHooks(settings = {}, runner = DEFAULT_RUNNER) {
  const out = { ...settings, hooks: { ...(settings.hooks || {}) } };
  const helm = helmHooks(runner);
  for (const [event, groups] of Object.entries(helm)) {
    const existing = Array.isArray(out.hooks[event]) ? [...out.hooks[event]] : [];
    if (!existing.some((g) => hasHelmCommand(g, runner))) {
      existing.push(...groups);
    }
    out.hooks[event] = existing;
  }
  return out;
}
