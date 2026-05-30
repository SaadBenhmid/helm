export function renderStateMd(state, action) {
  return [
    "# Helm — Project State",
    "",
    `- **Current phase:** ${state.currentPhase}`,
    `- **Status:** ${state.phaseStatus}`,
    `- **Updated:** ${state.updatedAt}`,
    "",
    "## Next action",
    "",
    action.message,
    "",
  ].join("\n");
}

// Auto-captured handoff note, written by the SessionEnd / PreCompact hooks so the
// next session can resume cleanly even if context was lost or compacted.
export function renderHandoff(state, reason, actionMessage) {
  return [
    "# Handoff Note (auto-captured)",
    "",
    `- **Reason:** ${reason}`,
    `- **Captured:** ${new Date().toISOString()}`,
    `- **Project type:** ${state.projectType || "new"}`,
    `- **Current phase:** ${state.currentPhase} (${state.phaseStatus})`,
    `- **Milestone:** ${state.milestone || 1}`,
    "",
    "## Next action",
    "",
    actionMessage,
    "",
    "## Resume",
    "",
    "The SessionStart hook runs `helm inject` automatically. Read this note, then continue the current phase.",
    "",
  ].join("\n");
}
