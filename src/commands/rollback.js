import { rollback as doRollback } from "../snapshot.js";
import { ensureInit, SNAP_ROOT } from "./_context.js";

export function rollback(argv) {
  ensureInit();
  const id = doRollback(".", SNAP_ROOT, argv[3]);
  console.log(`Rolled back to: ${id}`);
}
