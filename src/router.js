import { PHASE_ORDER } from "./state.js";

export const PHASE_REGISTRY = {
  validate: {
    label: "Validate",
    available: true,
    nextAction: "Run the market + cost validation. Produce a clear go / pivot / kill decision recorded in .helm/VALIDATION.md.",
  },
  prd: {
    label: "PRD",
    available: true,
    nextAction: "Write the PRD with the helm-prd skill: problem, users, scope + non-goals, tech & infra options ranked by expected #users and budget, and machine-verifiable acceptance criteria. Output .helm/PRD.md.",
  },
  mockup: {
    label: "Mockup → Template",
    available: true,
    nextAction: "Use the helm-mockup skill: build a mockup, confirm it, convert it into a reusable component template, confirm the template matches, then write .helm/DESIGN.md (the design identity).",
  },
  setup: {
    label: "Setup",
    available: true,
    nextAction: "Use the helm-setup skill: pick the framework for this project, install the code indexer (Serena), and set the model role slots in .helm/helm.config.json.",
  },
  build: {
    label: "Build loop",
    available: true,
    nextAction: "Use the helm-build skill: build in small vertical slices (plan → build → review per slice), run tests + the 3 killer checks, update memory, and commit each slice.",
  },
  ship: {
    label: "Ship",
    available: true,
    nextAction: "Use the helm-ship skill: run the production-readiness checklist with loud gates on secrets / data-loss / auth. Output .helm/SHIP.md.",
  },
};

// The `available: false` arms below are forward-compat hooks: a future Helm
// version may register a phase that exists in PHASE_ORDER but isn't built yet.
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
