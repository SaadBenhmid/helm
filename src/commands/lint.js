import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { lintMemory } from "../lint.js";
import { ensureInit, HELM_DIR, STATE_PATH } from "./_context.js";

export function lint() {
  ensureInit();
  const present = readdirSync(HELM_DIR).filter((f) => {
    // statSync can throw if an entry vanishes between readdir and stat (race on a
    // busy machine/CI). Skip anything we can't stat rather than crashing.
    try {
      return statSync(join(HELM_DIR, f)).isFile();
    } catch {
      return false;
    }
  });
  const stateText = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, "utf8") : null;
  const findings = lintMemory({ stateText, present });
  if (findings.length === 0) {
    console.log("Memory looks healthy. ✅");
  } else {
    for (const f of findings) console.log(`${f.level === "error" ? "✖ ERROR" : "⚠ WARN"}  ${f.msg}`);
  }
  if (findings.some((f) => f.level === "error")) process.exit(1);
}
