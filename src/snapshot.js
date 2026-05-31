import { cpSync, mkdirSync, existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

let __seq = 0;

// --- Path safety (external audit P1) ---------------------------------------
// The snapshot id (and the label baked into it) becomes a filesystem path, and
// rollback consumes both an id and the path list inside a manifest. None of that
// may be trusted to stay inside its directory: a label like "feature/foo" or
// "../../escaped", an id of "../../evil", or a tampered manifest path could
// otherwise read or DELETE files outside the snapshot store / project root.

// Reduce a free-text label to a single safe path segment: keep word chars, dot,
// dash; collapse runs of dots (so ".." can't survive) and any other char to "-";
// trim leading/trailing dashes. Never empty, never a separator, never traversal.
function sanitizeLabel(label) {
  const cleaned = String(label == null ? "" : label)
    .replace(/\.{2,}/g, "-") // kill ".." (and "...") before anything else
    .replace(/[^a-zA-Z0-9._-]/g, "-") // separators, spaces, etc. → dash
    .replace(/^-+|-+$/g, "");
  // A lone "." would survive the whitelist but yields a dot-only id segment, so
  // fall back to the default rather than emit it.
  return cleaned && cleaned !== "." ? cleaned : "auto";
}

// A real snapshot id is a single flat segment. Reject anything with a separator,
// traversal, NUL byte, or a "." that would resolve back to the snapshot root,
// before the id is ever joined into a path.
function assertSafeId(id) {
  if (
    typeof id !== "string" ||
    !id ||
    id === "." ||
    id.includes("\x00") ||
    id.includes("/") ||
    id.includes("\\") ||
    id.includes("..")
  ) {
    throw new Error(`invalid snapshot id: ${id}`);
  }
}

// Resolve `child` under `rootDir` and confirm it stays strictly INSIDE it.
// Returns the absolute path when safe, or null when the entry would land on the
// root itself (e.g. a manifest path of ".") or escape it (e.g. "../../etc").
// Callers skip null entries so a corrupt/tampered manifest can never drive an
// out-of-tree — or whole-root — rmSync/cpSync.
function safeJoin(rootDir, child) {
  const root = resolve(rootDir);
  const full = resolve(root, child);
  if (full === root || !full.startsWith(root + sep)) return null;
  return full;
}

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
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${seq}-${sanitizeLabel(label)}`;
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
  assertSafeId(target); // never let a caller-supplied id escape snapshotRoot
  const dir = join(snapshotRoot, target);
  if (!existsSync(dir)) throw new Error(`snapshot not found: ${target}`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

  // Restore captured paths: blow away the current dest, then copy the snapshot back.
  // Guards: (1) every manifest path must resolve INSIDE both the snapshot dir and
  // baseDir — a tampered/corrupt manifest path that escapes is skipped, never used
  // to drive rmSync/cpSync. (2) Only wipe the dest once we've confirmed the snapshot
  // copy still exists, so a missing stored copy can't destroy the live tree.
  for (const p of manifest.paths || []) {
    const src = safeJoin(dir, p);
    const dest = safeJoin(baseDir, p);
    if (!src || !dest || !existsSync(src)) continue;
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }

  // Restore "absent" paths: they shouldn't exist in this snapshot, so prune any that
  // were created after the snapshot was taken — but only if they resolve inside baseDir.
  for (const p of manifest.absent || []) {
    const dest = safeJoin(baseDir, p);
    if (dest && existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  }

  return target;
}
