import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const PROJECT_TYPES = ["new", "existing"];

// The journey differs by project type:
// - new (greenfield): validate the idea, design it, then build.
// - existing (brownfield): adopt/understand the codebase first, then work in milestones.
export const PHASE_ORDERS = {
  new: ["validate", "prd", "mockup", "setup", "build", "ship"],
  existing: ["adopt", "prd", "build", "ship"],
};

// Backward-compatible default order (greenfield).
export const PHASE_ORDER = PHASE_ORDERS.new;

// Every phase that can appear in any order — used for validation.
export const ALL_PHASES = [...new Set([...PHASE_ORDERS.new, ...PHASE_ORDERS.existing])];

export const STATUSES = ["not_started", "in_progress", "awaiting_user", "complete"];

export function orderFor(state) {
  const type = (state && state.projectType) || "new";
  return PHASE_ORDERS[type] || PHASE_ORDERS.new;
}

export function defaultState(projectType = "new") {
  if (!PROJECT_TYPES.includes(projectType)) throw new Error(`invalid projectType: ${projectType}`);
  const first = PHASE_ORDERS[projectType][0];
  return {
    projectType,
    currentPhase: first,
    phaseStatus: "not_started",
    milestone: 1,
    phases: { [first]: "not_started" },
    updatedAt: new Date().toISOString(),
  };
}

export function validateState(state) {
  if (!state || typeof state !== "object") throw new Error("state must be an object");
  if (state.projectType !== undefined && !PROJECT_TYPES.includes(state.projectType)) {
    throw new Error(`invalid projectType: ${state.projectType}`);
  }
  if (!ALL_PHASES.includes(state.currentPhase)) throw new Error(`invalid currentPhase: ${state.currentPhase}`);
  if (!STATUSES.includes(state.phaseStatus)) throw new Error(`invalid phaseStatus: ${state.phaseStatus}`);
  return true;
}

export function readState(path) {
  if (!existsSync(path)) throw new Error(`state file not found: ${path}`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  validateState(state);
  return state;
}

export function writeState(path, state) {
  validateState(state);
  state.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
  return state;
}

export function advanceState(state) {
  validateState(state);
  const out = { ...state, phases: { ...(state.phases || {}) } };
  const order = orderFor(out);
  const idx = order.indexOf(out.currentPhase);
  const next = order[idx + 1];
  out.phases[out.currentPhase] = "complete";
  if (!next) {
    out.phaseStatus = "complete";
  } else {
    out.currentPhase = next;
    out.phaseStatus = "not_started";
    out.phases[next] = "not_started";
  }
  return out;
}

// Start the next unit of work (a new feature/fix milestone) on top of finished work.
// Resets to the spec phase ("prd") so the loop is: prd → build → ship → (milestone) → prd …
export function startMilestone(state) {
  validateState(state);
  const out = { ...state, phases: { ...(state.phases || {}) } };
  out.milestone = (out.milestone || 1) + 1;
  out.currentPhase = "prd";
  out.phaseStatus = "not_started";
  out.phases.prd = "not_started";
  return out;
}
