import { join, resolve } from "node:path";
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { writeState, defaultState } from "../state.js";
import { mergeHooks } from "../hooks.js";
import { emptyStore } from "../telemetry.js";
import { PKG_ROOT, HELM_DIR, STATE_PATH, CONFIG_PATH, TELEMETRY_PATH, SETTINGS_PATH, logEvent } from "./_context.js";

export function init(argv) {
  // --dry-run: print exactly what init would write/copy, then exit WITHOUT touching disk.
  if (argv.includes("--dry-run")) {
    console.log("WRITE PLAN — `helm init` would create/copy the following (nothing was written):");
    const plan = [
      "CLAUDE.md",
      "skills/ (bundled skills)",
      "templates/ (bundled templates)",
      ".helm/runtime/bin/ (isolated local runtime)",
      ".helm/runtime/src/ (isolated local runtime)",
      STATE_PATH,
      CONFIG_PATH,
      join(HELM_DIR, "DECISIONS.md"),
      join(HELM_DIR, "ISSUES.md"),
      join(HELM_DIR, "LEARNINGS.md"),
      join(HELM_DIR, "frameworks.json"),
      TELEMETRY_PATH,
      join(HELM_DIR, "run-log.jsonl (created on first event)"),
      SETTINGS_PATH,
    ];
    for (const p of plan) console.log(`  + ${p}`);
    console.log("No files written (dry run).");
    process.exit(0);
  }
  mkdirSync(HELM_DIR, { recursive: true });
  // Install the RUNTIME ISOLATED under .helm/runtime so it can never collide with
  // the host app's own src/ or bin/, and so rollback can't wipe the user's source
  // (audit P0). It is a COMPLETE package mirror — bin, src, package.json AND the
  // bundled skills/templates/CLAUDE.md — so a re-init invoked FROM the isolated
  // runtime can repair missing root assets (follow-up audit P2a). force:true keeps
  // the mirror current on every init.
  const runtimeDir = join(HELM_DIR, "runtime");
  for (const asset of ["bin", "src", "package.json", "CLAUDE.md", "skills", "templates"]) {
    const src = join(PKG_ROOT, asset);
    const dest = resolve(join(runtimeDir, asset));
    if (existsSync(src) && resolve(src) !== dest) {
      cpSync(src, dest, { recursive: true, force: true, errorOnExist: false });
    }
  }
  // Install project-facing assets (skills, templates, CLAUDE.md) at the root where
  // Claude Code and the user expect them. force:false never clobbers app files.
  // Source is PKG_ROOT — which, when init runs from the isolated runtime, is the
  // complete mirror above, so deleted root assets are restored from it.
  for (const asset of ["CLAUDE.md", "skills", "templates"]) {
    const src = join(PKG_ROOT, asset);
    const dest = resolve(asset);
    if (existsSync(src) && resolve(src) !== dest) {
      cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
    }
  }
  // Project type: `--existing` (brownfield, starts at Adopt) or default `new` (greenfield).
  const projectType = argv.includes("--existing") ? "existing" : "new";
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState(projectType));
  if (!existsSync(CONFIG_PATH)) copyFileSync(join(PKG_ROOT, "templates", "helm.config.json"), CONFIG_PATH);
  // Seed the framework registry so `helm frameworks` works immediately (refreshable later).
  const fwSeed = join(HELM_DIR, "frameworks.json");
  if (!existsSync(fwSeed) && existsSync(join(PKG_ROOT, "templates", "frameworks.json"))) {
    copyFileSync(join(PKG_ROOT, "templates", "frameworks.json"), fwSeed);
  }
  // Seed token/credit telemetry so `helm track` and the dashboard work immediately.
  if (!existsSync(TELEMETRY_PATH)) writeFileSync(TELEMETRY_PATH, JSON.stringify(emptyStore(), null, 2) + "\n");
  // Seed the append-only memory logs so memory exists from the very first phase.
  for (const mem of ["DECISIONS.md", "ISSUES.md", "LEARNINGS.md"]) {
    const dst = join(HELM_DIR, mem);
    const srcTpl = join(PKG_ROOT, "templates", mem);
    if (!existsSync(dst) && existsSync(srcTpl)) copyFileSync(srcTpl, dst);
  }
  // Autopilot: install the memory hooks now so context survives auto-compaction with
  // zero user action. Skip (don't clobber) if existing settings.json is malformed.
  let settings = {};
  let settingsOk = true;
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      settingsOk = false;
      console.warn(".claude/settings.json is invalid JSON — skipping hook install. Run `helm hooks install` after fixing it.");
    }
  }
  if (settingsOk) {
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(settings), null, 2) + "\n");
  }
  logEvent({ type: "init", projectType });
  console.log(`Helm initialized (${projectType} project): .helm/ + memory hooks installed, skills + CLAUDE.md ready.`);
}
