#!/usr/bin/env node
import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { readState, writeState, defaultState, advanceState } from "../src/state.js";
import { nextAction } from "../src/router.js";
import { renderStateMd } from "../src/render.js";
import { snapshot, rollback } from "../src/snapshot.js";

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
  mkdirSync(HELM_DIR, { recursive: true });
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState());
  if (!existsSync(CONFIG_PATH)) copyFileSync(join("templates", "helm.config.json"), CONFIG_PATH);
  console.log("Helm initialized in .helm/");
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
  const id = snapshot(".", CORE_PATHS, SNAP_ROOT, process.argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
} else if (cmd === "rollback") {
  const id = rollback(".", SNAP_ROOT, process.argv[3]);
  console.log(`Rolled back to: ${id}`);
} else {
  console.log("Usage: helm <init|status|next|advance|snapshot [label]|rollback [id]>");
}
