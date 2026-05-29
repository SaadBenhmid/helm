import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const PHASE_ORDER = ["validate", "prd", "mockup", "setup", "build", "ship"];
export const STATUSES = ["not_started", "in_progress", "awaiting_user", "complete"];

export function defaultState() {
  return {
    currentPhase: "validate",
    phaseStatus: "not_started",
    phases: { validate: "not_started" },
    updatedAt: new Date().toISOString(),
  };
}

export function validateState(state) {
  if (!state || typeof state !== "object") throw new Error("state must be an object");
  if (!PHASE_ORDER.includes(state.currentPhase)) throw new Error(`invalid currentPhase: ${state.currentPhase}`);
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
