import { cpSync, mkdirSync, existsSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

let __seq = 0;

export function snapshot(baseDir, paths, snapshotRoot, label = "auto") {
  const seq = String(__seq++).padStart(4, "0");
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${seq}-${label}`;
  const dest = join(snapshotRoot, id);
  mkdirSync(dest, { recursive: true });
  for (const p of paths) {
    const src = join(baseDir, p);
    if (existsSync(src)) cpSync(src, join(dest, p), { recursive: true });
  }
  writeFileSync(
    join(dest, "manifest.json"),
    JSON.stringify({ id, label, paths, createdAt: new Date().toISOString() }, null, 2)
  );
  return id;
}

export function listSnapshots(snapshotRoot) {
  if (!existsSync(snapshotRoot)) return [];
  return readdirSync(snapshotRoot)
    .filter((d) => existsSync(join(snapshotRoot, d, "manifest.json")))
    .sort();
}

export function rollback(baseDir, snapshotRoot, id) {
  const snaps = listSnapshots(snapshotRoot);
  if (snaps.length === 0) throw new Error("no snapshots to roll back to");
  const target = id || snaps[snaps.length - 1];
  const dir = join(snapshotRoot, target);
  if (!existsSync(dir)) throw new Error(`snapshot not found: ${target}`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  for (const p of manifest.paths) {
    const src = join(dir, p);
    const dest = join(baseDir, p);
    if (existsSync(src)) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
  }
  return target;
}
