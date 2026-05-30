import { cpSync, mkdirSync, existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

let __seq = 0;

// Take a snapshot of `paths` (top-level entries, relative to `baseDir`) into a new
// timestamped directory under `snapshotRoot`. Each captured entry is copied verbatim
// (files and directories alike). A `manifest.json` records exactly which of the
// requested paths actually existed and were captured — that captured list is the
// source of truth for rollback. Paths that didn't exist at snapshot time are recorded
// separately under `absent` so rollback can prune them if they appear later.
//
// Signature is fixed: snapshot(baseDir, paths, snapshotRoot, label).
export function snapshot(baseDir, paths, snapshotRoot, label = "auto") {
  const seq = String(__seq++).padStart(4, "0");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${seq}-${label}`;
  const dest = join(snapshotRoot, id);
  mkdirSync(dest, { recursive: true });
  const captured = [];
  const absent = [];
  for (const p of paths) {
    const src = join(baseDir, p);
    if (existsSync(src)) {
      cpSync(src, join(dest, p), { recursive: true });
      captured.push(p);
    } else {
      // The path was tracked but didn't exist yet. Remember it so rollback can
      // restore the "not present" state (prune it) if it gets created later.
      absent.push(p);
    }
  }
  writeFileSync(
    join(dest, "manifest.json"),
    JSON.stringify(
      { id, label, paths: captured, absent, requested: paths, createdAt: new Date().toISOString() },
      null,
      2
    )
  );
  return id;
}

export function listSnapshots(snapshotRoot) {
  if (!existsSync(snapshotRoot)) return [];
  return readdirSync(snapshotRoot)
    .filter((d) => existsSync(join(snapshotRoot, d, "manifest.json")))
    .sort();
}

// Restore the project to a snapshot. For each TRACKED path the snapshot knows about,
// we replace the current state wholesale: remove whatever is at the destination now,
// then copy the snapshot's copy back. Because the destination is removed first, any
// file ADDED INSIDE a tracked directory after the snapshot is pruned — rollback yields
// the exact tree that was captured, not a merge.
//
// Two path buckets are handled:
//   - `paths`  (captured): existed at snapshot time → restore from the snapshot copy.
//   - `absent`             : tracked but did NOT exist at snapshot time → ensure they
//                            are gone now (prune if created since).
//
// IMPORTANT (documented limitation, handled in the README): rollback can only reason
// about the tracked top-level paths. A brand-new file created OUTSIDE every tracked
// path cannot be detected or removed — there is no record that it shouldn't exist.
//
// Signature is fixed: rollback(baseDir, snapshotRoot, id). `id` defaults to latest.
export function rollback(baseDir, snapshotRoot, id) {
  const snaps = listSnapshots(snapshotRoot);
  if (snaps.length === 0) throw new Error("no snapshots to roll back to");
  const target = id || snaps[snaps.length - 1];
  const dir = join(snapshotRoot, target);
  if (!existsSync(dir)) throw new Error(`snapshot not found: ${target}`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

  // Restore captured paths: blow away the current dest, then copy the snapshot back.
  // Guard: only wipe the destination once we've confirmed the snapshot copy still
  // exists. If a snapshot's stored copy is missing/corrupted, removing dest first
  // would silently destroy the live tree with nothing to restore from.
  for (const p of manifest.paths || []) {
    const src = join(dir, p);
    const dest = join(baseDir, p);
    if (!existsSync(src)) continue;
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }

  // Restore "absent" paths: they shouldn't exist in this snapshot, so prune any that
  // were created after the snapshot was taken.
  for (const p of manifest.absent || []) {
    const dest = join(baseDir, p);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  }

  return target;
}
