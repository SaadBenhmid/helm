import { existsSync, writeFileSync } from "node:fs";
import { readState } from "../state.js";
import { nextAction } from "../router.js";
import { renderHandoff } from "../render.js";
import { STATE_PATH, HANDOFF_PATH } from "./_context.js";

export function capture(argv) {
  // SessionEnd / PreCompact hook: write a handoff so nothing is lost. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const ri = argv.indexOf("--reason");
      const reason = ri > -1 && argv[ri + 1] ? argv[ri + 1] : "manual";
      const state = readState(STATE_PATH);
      writeFileSync(HANDOFF_PATH, renderHandoff(state, reason, nextAction(state).message));
      console.log(`Helm captured handoff (${reason}).`);
    }
  } catch {
    /* never block a session on a hook error */
  }
}
