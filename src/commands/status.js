import { readState } from "../state.js";
import { nextAction } from "../router.js";
import { renderStateMd } from "../render.js";
import { ensureInit, STATE_PATH } from "./_context.js";

export function status() {
  ensureInit();
  const state = readState(STATE_PATH);
  console.log(renderStateMd(state, nextAction(state)));
}
