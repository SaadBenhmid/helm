import { existsSync } from "node:fs";
import { readState } from "../state.js";
import { nextAction } from "../router.js";
import { renderStateMd } from "../render.js";
import { STATE_PATH } from "./_context.js";

export function inject() {
  // SessionStart hook: print current state into the new session. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const state = readState(STATE_PATH);
      console.log(renderStateMd(state, nextAction(state)));
    } else {
      console.log("Helm is present but not initialized. Run: node .helm/runtime/bin/helm.js init");
    }
  } catch {
    /* never block a session on a hook error */
  }
}
