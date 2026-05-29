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
