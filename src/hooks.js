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

// Merge Helm's hooks into an existing settings object without clobbering other
// hooks or settings. Idempotent: running twice does not duplicate Helm entries.
// Matches on the EXACT command string (not a substring) to avoid false positives.
export function mergeHooks(settings = {}, runner = DEFAULT_RUNNER) {
  const out = { ...settings, hooks: { ...(settings.hooks || {}) } };
  const helm = helmHooks(runner);
  for (const [event, groups] of Object.entries(helm)) {
    const ourCommands = groups.flatMap((g) => g.hooks.map((h) => h.command));
    const existing = Array.isArray(out.hooks[event]) ? [...out.hooks[event]] : [];
    const alreadyPresent = existing.some(
      (g) => Array.isArray(g.hooks) && g.hooks.some((h) => ourCommands.includes(h.command))
    );
    if (!alreadyPresent) existing.push(...groups);
    out.hooks[event] = existing;
  }
  return out;
}
