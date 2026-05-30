import { existsSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { rollback as doRollback } from "../snapshot.js";
import { ensureInit, SNAP_ROOT, RUNTIME_DIR, isHelmSourceRepo } from "./_context.js";

export function rollback(argv) {
  ensureInit();
  const id = doRollback(".", SNAP_ROOT, argv[3]);
  // In an installed host app the snapshot captured ONLY .helm/runtime (the canonical
  // Helm assets) — root skills/ + CLAUDE.md are mirror copies, not snapshotted, so
  // they wouldn't otherwise be undone. Re-sync them from the just-restored runtime so
  // a rolled-back Helm core change is reflected at the root too (templates/ is never
  // placed at root). In the Helm SOURCE repo the root files ARE the source and were
  // restored directly by the rollback, so skip. (Follow-up audit review.)
  if (!isHelmSourceRepo() && existsSync(RUNTIME_DIR)) {
    for (const asset of ["CLAUDE.md", "skills"]) {
      const src = resolve(join(RUNTIME_DIR, asset));
      if (existsSync(src)) cpSync(src, resolve(asset), { recursive: true, force: true });
    }
  }
  console.log(`Rolled back to: ${id}`);
}
