import { snapshot as makeSnapshot } from "../snapshot.js";
import { ensureInit, CORE_PATHS, SNAP_ROOT } from "./_context.js";

export function snapshot(argv) {
  ensureInit();
  const id = makeSnapshot(".", CORE_PATHS, SNAP_ROOT, argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
}
