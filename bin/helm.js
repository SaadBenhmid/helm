#!/usr/bin/env node
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, copyFileSync, cpSync } from "node:fs";
import { readState, writeState, defaultState, advanceState } from "../src/state.js";
import { nextAction } from "../src/router.js";
import { renderStateMd } from "../src/render.js";
import { snapshot, rollback } from "../src/snapshot.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELM_DIR = ".helm";
const STATE_PATH = join(HELM_DIR, "state.json");
const CONFIG_PATH = join(HELM_DIR, "helm.config.json");
const SNAP_ROOT = join(HELM_DIR, "snapshots");
const CORE_PATHS = ["src", "bin", "skills", "templates", "CLAUDE.md", CONFIG_PATH];

function ensureInit() {
  if (!existsSync(STATE_PATH)) {
    console.error("Helm not initialized. Run: helm init");
    process.exit(1);
  }
}

const cmd = process.argv[2];

if (cmd === "init") {
  // Install bundled assets from the package into the current project (idempotent).
  for (const asset of ["CLAUDE.md", "skills", "templates"]) {
    const src = join(PKG_ROOT, asset);
    const dest = resolve(asset);
    if (existsSync(src) && resolve(src) !== dest) {
      cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
    }
  }
  mkdirSync(HELM_DIR, { recursive: true });
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState());
  if (!existsSync(CONFIG_PATH)) copyFileSync(join(PKG_ROOT, "templates", "helm.config.json"), CONFIG_PATH);
  console.log("Helm initialized: .helm/ created, skills + CLAUDE.md installed in this project.");
} else if (cmd === "status" || cmd === "next") {
  ensureInit();
  const state = readState(STATE_PATH);
  console.log(renderStateMd(state, nextAction(state)));
} else if (cmd === "advance") {
  ensureInit();
  const updated = advanceState(readState(STATE_PATH));
  writeState(STATE_PATH, updated);
  console.log(renderStateMd(updated, nextAction(updated)));
} else if (cmd === "snapshot") {
  ensureInit();
  const id = snapshot(".", CORE_PATHS, SNAP_ROOT, process.argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
} else if (cmd === "rollback") {
  ensureInit();
  const id = rollback(".", SNAP_ROOT, process.argv[3]);
  console.log(`Rolled back to: ${id}`);
} else {
  console.log("Usage: helm <init|status|next|advance|snapshot [label]|rollback [id]>");
}
