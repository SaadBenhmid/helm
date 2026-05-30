import { readState, writeState, startMilestone } from "../state.js";
import { nextAction } from "../router.js";
import { renderStateMd } from "../render.js";
import { ensureInit, STATE_PATH } from "./_context.js";

export function milestone() {
  ensureInit();
  try {
    const updated = startMilestone(readState(STATE_PATH));
    writeState(STATE_PATH, updated);
    console.log(`Starting milestone ${updated.milestone}.`);
    console.log(renderStateMd(updated, nextAction(updated)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
