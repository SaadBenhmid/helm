import { PHASE_ORDER } from "./state.js";

export const PHASE_REGISTRY = {
  validate: {
    label: "Validate",
    available: true,
    nextAction: "Run the market + cost validation. Produce a clear go / pivot / kill decision recorded in .helm/VALIDATION.md.",
  },
  prd: { label: "PRD", available: false },
  mockup: { label: "Mockup → Template", available: false },
  setup: { label: "Setup", available: false },
  build: { label: "Build loop", available: false },
  ship: { label: "Ship", available: false },
};

export function nextAction(state, registry = PHASE_REGISTRY) {
  const phase = state.currentPhase;
  const entry = registry[phase];
  if (!entry) throw new Error(`unknown phase: ${phase}`);

  if (state.phaseStatus === "complete") {
    const idx = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[idx + 1];
    if (!next) return { phase: "done", available: true, message: "All phases complete. Ready to ship. 🚢" };
    const nextEntry = registry[next];
    return {
      phase: next,
      available: nextEntry.available,
      message: nextEntry.available
        ? `Phase "${entry.label}" complete → next: ${nextEntry.label}. ${nextEntry.nextAction}`
        : `Phase "${entry.label}" complete → next: ${nextEntry.label} (not built in this Helm version yet).`,
    };
  }

  return {
    phase,
    available: entry.available,
    message: entry.available
      ? `You're in phase "${entry.label}" (${state.phaseStatus}). ${entry.nextAction}`
      : `Phase "${entry.label}" is not built in this Helm version yet.`,
  };
}
