import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadRegistry, scoreFrameworks, isStale } from "../frameworks.js";
import { ensureInit, PKG_ROOT, HELM_DIR } from "./_context.js";

export function frameworks(argv) {
  ensureInit();
  const regPath = join(HELM_DIR, "frameworks.json");
  const src = existsSync(regPath) ? regPath : join(PKG_ROOT, "templates", "frameworks.json");
  if (!existsSync(src)) {
    // The isolated runtime (.helm/runtime) ships only bin/src/package.json — not
    // templates — so the seeded copy in .helm/ is the only registry. If it's gone,
    // a re-init from the full package restores it.
    console.error("Framework registry not found (.helm/frameworks.json). Restore it with: npx github:SaadBenhmid/helm init");
    process.exit(1);
  }
  let reg;
  try {
    reg = loadRegistry(readFileSync(src, "utf8"));
  } catch (e) {
    console.error(`Framework registry invalid (${src}): ${e.message}`);
    process.exit(1);
  }
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const ALLOWED = { size: ["small", "medium", "large"], rigor: ["low", "medium", "high"], ui: ["low", "medium", "high"], team: ["solo", "team"] };
  const sig = {};
  for (const k of ["size", "rigor", "ui", "team"]) {
    const v = flag(k);
    if (v == null) continue;
    if (!ALLOWED[k].includes(v)) {
      console.error(`Invalid --${k} "${v}". Allowed: ${ALLOWED[k].join(", ")}`);
      process.exit(1);
    }
    sig[k] = v;
  }
  const hasSignals = Object.keys(sig).length > 0;
  const ranked = scoreFrameworks(reg, sig);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  console.log(`\nAI-workflow frameworks${hasSignals ? " — ranked for " + Object.entries(sig).map(([k, v]) => `${k}=${v}`).join(", ") : ""}  (verified ${reg.lastVerified})`);
  if (isStale(reg, today)) console.log("⚠ Registry may be stale — refresh it with the helm-frameworks-refresh skill.");
  console.log("");
  ranked.forEach((r, i) => {
    const fw = reg.frameworks.find((f) => f.id === r.id);
    const tied = hasSignals && i > 0 && ranked[i - 1].score === r.score;
    const tag = hasSignals ? `  [${r.score >= 0 ? "+" : ""}${r.score}${tied ? ", tie" : ""}]` : "";
    console.log(`${hasSignals ? `${i + 1}. ` : "• "}${fw.name}${tag}`);
    console.log(`    ${fw.bestFor}`);
    if (hasSignals && r.why.length) console.log(`    fit: ${r.why.join("; ")}`);
  });
  if (!hasSignals && Array.isArray(reg.guidance)) {
    console.log("\nRules of thumb:");
    for (const g of reg.guidance) console.log(`  – ${g}`);
  }
  console.log("\nTip: narrow it with flags, e.g. helm frameworks --size large --rigor high --team team");
  console.log("");
}
