import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mergeHooks } from "../hooks.js";
import { SETTINGS_PATH } from "./_context.js";

export function hooks(argv) {
  if (argv[3] === "install") {
    let existing = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        existing = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
      } catch {
        console.error(".claude/settings.json is not valid JSON — fix or remove it, then re-run.");
        process.exit(1);
      }
    }
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(existing), null, 2) + "\n");
    console.log("Helm hooks installed in .claude/settings.json (SessionStart, SessionEnd, PreCompact).");
  } else {
    console.log("Usage: helm hooks install");
  }
}
