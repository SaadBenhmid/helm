// Claude Code hook wiring so context/memory management is enforced by the harness,
// not left to the agent's discipline:
//   SessionStart -> inject Helm state into the new session
//   SessionEnd / PreCompact -> capture a handoff before context is lost

// The runtime is installed isolated under .helm/runtime (see init), so hooks must
// invoke it there — never a top-level bin/ that could collide with the host app.
const DEFAULT_RUNNER = "node .helm/runtime/bin/helm.js";

export function helmHooks(runner = DEFAULT_RUNNER) {
  return {
    SessionStart: [{ hooks: [{ type: "command", command: `${runner} inject` }] }],
    SessionEnd: [{ hooks: [{ type: "command", command: `${runner} capture --reason session-end` }] }],
    PreCompact: [{ hooks: [{ type: "command", command: `${runner} capture --reason precompact` }] }],
  };
}

// Recognises ANY Helm-owned memory hook regardless of which runner installed it —
// the old pre-isolation `node bin/helm.js inject` as well as the current
// `node .helm/runtime/bin/helm.js capture`. Anchored to the known Helm runtime
// paths so an unrelated user script (e.g. `node tools/my-helm.js capture`) is never
// pruned. Used to remove stale copies on upgrade.
const HELM_HOOK_RE = /node\s+(?:\.helm[\\/]runtime[\\/])?bin[\\/]helm\.js\s+(?:inject|capture)\b/;
const isHelmHookGroup = (g) =>
  g && Array.isArray(g.hooks) && g.hooks.some((h) => HELM_HOOK_RE.test((h && h.command) || ""));

// Merge Helm's hooks into an existing settings object without clobbering other
// hooks or settings. Idempotent AND upgrade-safe: any prior Helm inject/capture
// hook (including an old pre-isolation runner) is REMOVED before the current ones
// are added, so an upgraded project never double-runs old + new hooks (audit P2b).
// Non-Helm hooks on the same event are preserved untouched.
export function mergeHooks(settings = {}, runner = DEFAULT_RUNNER) {
  const out = { ...settings, hooks: { ...(settings.hooks || {}) } };
  const helm = helmHooks(runner);
  // First prune stale Helm hooks from EVERY event — including events Helm no longer
  // uses — so an old install that wired a different event can't leave a zombie hook.
  for (const [event, existing] of Object.entries(out.hooks)) {
    if (Array.isArray(existing)) out.hooks[event] = existing.filter((g) => !isHelmHookGroup(g));
  }
  // Then add the current runner's hooks for each event Helm uses.
  for (const [event, groups] of Object.entries(helm)) {
    const existing = Array.isArray(out.hooks[event]) ? [...out.hooks[event]] : [];
    existing.push(...groups);
    out.hooks[event] = existing;
  }
  return out;
}
