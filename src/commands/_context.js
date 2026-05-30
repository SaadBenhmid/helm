// Shared constants and helpers for all helm CLI command modules.
//
// This module centralises everything bin/helm.js used to define inline: path
// constants, the repo walker, the security runner, artifact loaders, and the
// project gatherer used by `score` and `dashboard`. Command modules import from
// here so each command stays a thin, testable unit. Behaviour is identical to
// the pre-split monolith — these are verbatim extractions.
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, lstatSync } from "node:fs";
import { readState } from "../state.js";
import { lintMemory } from "../lint.js";
import { scanSecurity } from "../security.js";
import { scoreProject } from "../score.js";
import { loadTelemetry, summarize } from "../telemetry.js";
import { parseGoals } from "../goals.js";
import { parseIssues } from "../board.js";
import { appendEvent, parseRunLog, summarizeRun } from "../runlog.js";

export const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const HELM_DIR = ".helm";
export const STATE_PATH = join(HELM_DIR, "state.json");
export const CONFIG_PATH = join(HELM_DIR, "helm.config.json");
export const SNAP_ROOT = join(HELM_DIR, "snapshots");
export const HANDOFF_PATH = join(HELM_DIR, "handoff.md");
export const TELEMETRY_PATH = join(HELM_DIR, "telemetry.json");
export const VERIFY_PATH = join(HELM_DIR, "verify.json");
export const PRD_PATH = join(HELM_DIR, "PRD.md");
export const RUNLOG_PATH = join(HELM_DIR, "run-log.jsonl");
export const SETTINGS_PATH = join(".claude", "settings.json");
// Where Helm's runtime is installed inside a host project: ISOLATED under .helm/
// so it can never collide with — or, on rollback, wipe — the app's own src/ or bin/.
export const RUNTIME_DIR = join(HELM_DIR, "runtime");
// Snapshot/rollback target set ("Helm's core"). This is CONTEXT-AWARE so "snapshot
// before a core change" backs up the RIGHT runtime in both worlds:
//   - Developing Helm itself (root package.json name === "helm"): the live runtime
//     is the tracked top-level src/ + bin/, so snapshot those. (Follow-up audit P1.)
//   - Helm installed into a host app: the runtime is isolated under .helm/runtime,
//     and the app's own src/ + bin must NEVER be touched. (Audit P0.)
// The bundled skills/templates/CLAUDE.md/config are Helm-owned in both cases.
export function corePaths(root = process.cwd()) {
  if (isHelmSourceRepo(root)) {
    // Developing Helm itself: the tracked top-level files ARE Helm; protect them.
    return ["src", "bin", "skills", "templates", "CLAUDE.md", CONFIG_PATH];
  }
  // Installed in a host app: snapshot ONLY Helm-owned paths under .helm/ — never a
  // root directory that shares the app's namespace. Host apps (Django/Rails/Flask)
  // own a root templates/ (and may own skills/), so including those let rollback
  // prune the user's files. The runtime mirror under .helm/runtime already holds the
  // canonical skills/templates/CLAUDE.md, and re-init restores the root copies from
  // it — so nothing Helm-owned is lost. (Follow-up audit P1.)
  return [RUNTIME_DIR, CONFIG_PATH];
}

// Is `root` the Helm SOURCE package itself (so root src/bin ARE the live runtime),
// as opposed to a host app that merely has Helm installed? This gates a
// safety-critical branch: a false positive would let `rollback` wipe a host app's
// own src/bin. So we demand the full Helm fingerprint — the package named "helm"
// AND its actual runtime files present at root — not just the name (a host app
// could coincidentally be named "helm"). Invocation-independent: it inspects the
// project tree, not which runner launched us. Any failure → safe "host app" default.
export function isHelmSourceRepo(root = process.cwd()) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (!pkg || pkg.name !== "helm") return false;
  } catch {
    return false;
  }
  return (
    existsSync(join(root, "bin", "helm.js")) &&
    existsSync(join(root, "src", "router.js")) &&
    existsSync(join(root, "src", "snapshot.js")) &&
    existsSync(join(root, "src", "commands", "_context.js"))
  );
}

export function ensureInit() {
  if (!existsSync(STATE_PATH)) {
    console.error("Helm not initialized. Run: helm init");
    process.exit(1);
  }
}

// Directories never worth scanning for secrets.
const SEC_SKIP_DIRS = new Set([".git", "node_modules", ".helm", ".firecrawl", ".claude", "coverage", ".next", ".cache"]);
const SEC_MAX_BYTES = 512 * 1024;
function secSkipFile(rel) {
  return (
    /\.min\.js$/.test(rel) ||
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(rel) ||
    /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|mp4|mov|woff2?|ttf|eot|wasm|map)$/i.test(rel)
  );
}
const secIsEnvFile = (rel) => /(^|\/)\.env(\.|$)/.test(rel);

// Walk the project: `files` (content map, scannable source) + `paths` (all files,
// for repo-level hygiene checks like .env-not-ignored). Reads stay off secret files.
export function collectRepo(root) {
  const files = {};
  const paths = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      let st;
      try {
        st = lstatSync(abs); // lstat: do not follow symlinks (avoids cycles / escaping the repo)
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (!SEC_SKIP_DIRS.has(name)) walk(abs);
      } else if (st.isFile()) {
        const rel = relative(root, abs).split("\\").join("/");
        paths.push(rel);
        if (secIsEnvFile(rel) || secSkipFile(rel) || st.size > SEC_MAX_BYTES) continue;
        try {
          files[rel] = readFileSync(abs, "utf8");
        } catch {
          /* unreadable/binary — skip */
        }
      }
    }
  })(root);
  return { files, paths };
}

export function runSecurity(root = ".") {
  const { files, paths } = collectRepo(root);
  const gitignore = existsSync(join(root, ".gitignore")) ? readFileSync(join(root, ".gitignore"), "utf8") : "";
  const findings = scanSecurity({ files, paths, gitignore });
  // Count inline suppressions so they are never an invisible bypass of the gate.
  let suppressed = 0;
  for (const content of Object.values(files)) {
    for (const line of content.split(/\r?\n/)) {
      if (/gitleaks:allow|helm:allow-secret/.test(line)) suppressed++;
    }
  }
  return { findings, suppressed };
}

export function printFinding(f) {
  const tag = f.level === "block" ? "🛑 BLOCK" : "⚠ WARN ";
  const loc = f.line ? `${f.file}:${f.line}` : f.file;
  console.log(`${tag} ${loc}  [${f.rule}] ${f.hint}  (${f.fingerprint})`);
}

export const ARTIFACT_FILES = ["VALIDATION.md", "PRD.md", "DESIGN.md", "SHIP.md", "CODEBASE.md", "DECISIONS.md", "ISSUES.md", "LEARNINGS.md", "handoff.md"];

// Required artifact per phase. Advancing OUT of one of these phases requires the
// artifact to exist and be a real (non-stub) document, unless --force is passed.
export const PHASE_ARTIFACT = { validate: "VALIDATION.md", prd: "PRD.md", mockup: "DESIGN.md", adopt: "CODEBASE.md", ship: "SHIP.md" };

// Append an audited row to the DECISIONS.md log (seeding the table header if the
// file is missing). Reused by the ship --force overrides.
export function auditDecision(decision, why, phase) {
  const decisions = join(HELM_DIR, "DECISIONS.md");
  if (!existsSync(decisions)) {
    writeFileSync(decisions, "# Decisions Log\n\n| Date | Decision | Why | Phase |\n|------|----------|-----|-------|\n");
  }
  const date = new Date().toISOString().slice(0, 10);
  appendFileSync(decisions, `| ${date} | ${decision} | ${why} | ${phase} |\n`);
}

// Append one event to the append-only run log (.helm/run-log.jsonl). Best-effort:
// the audit trail must never crash a command, so failures are swallowed. No-op if
// .helm doesn't exist yet (nothing to log against).
export function logEvent(event) {
  try {
    if (!existsSync(HELM_DIR)) return;
    const prior = existsSync(RUNLOG_PATH) ? readFileSync(RUNLOG_PATH, "utf8") : "";
    writeFileSync(RUNLOG_PATH, appendEvent(prior, event, new Date().toISOString()));
  } catch {
    /* never let logging break a command */
  }
}

// Load + summarize the run log (null when there's none / unreadable).
export function loadRunLog() {
  if (!existsSync(RUNLOG_PATH)) return null;
  try {
    const events = parseRunLog(readFileSync(RUNLOG_PATH, "utf8"));
    return { events, summary: summarizeRun(events) };
  } catch {
    return null;
  }
}

// Load the telemetry summary in the shape the dashboard wants: byPhase/byModel are
// flat maps of key → total tokens (in + out). summarize() returns nested buckets,
// so flatten them here. Returns null when there's no telemetry file / it's unreadable.
export function loadTelemetrySummary() {
  if (!existsSync(TELEMETRY_PATH)) return null;
  let sum;
  try {
    sum = summarize(loadTelemetry(readFileSync(TELEMETRY_PATH, "utf8")));
  } catch {
    return null;
  }
  const flatten = (buckets) => {
    const out = {};
    for (const [k, b] of Object.entries(buckets || {})) {
      out[k] = (Number(b.tokensIn) || 0) + (Number(b.tokensOut) || 0);
    }
    return out;
  };
  return {
    tokensIn: sum.tokensIn,
    tokensOut: sum.tokensOut,
    usd: sum.usd,
    count: sum.count,
    byPhase: flatten(sum.byPhase),
    byModel: flatten(sum.byModel),
  };
}

// Parse acceptance-criteria goals from the PRD (null when there's no PRD).
export function loadGoals() {
  if (!existsSync(PRD_PATH)) return null;
  try {
    return parseGoals(readFileSync(PRD_PATH, "utf8"));
  } catch {
    return null;
  }
}

// Load the last verify run (null when never run / unreadable).
export function loadVerify() {
  if (!existsSync(VERIFY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(VERIFY_PATH, "utf8"));
  } catch {
    return null;
  }
}

// Gather everything the scorecard + dashboard need from .helm/ and the repo (read-only).
export function gatherProject() {
  ensureInit();
  const state = readState(STATE_PATH);
  const present = readdirSync(HELM_DIR).filter((f) => {
    // statSync can throw if an entry vanishes between readdir and stat (race on a
    // busy machine/CI). Skip anything we can't stat rather than crashing.
    try {
      return statSync(join(HELM_DIR, f)).isFile();
    } catch {
      return false;
    }
  });
  const stateText = readFileSync(STATE_PATH, "utf8");
  const artifacts = {};
  for (const n of ARTIFACT_FILES) {
    const p = join(HELM_DIR, n);
    if (existsSync(p)) artifacts[n] = readFileSync(p, "utf8");
  }
  // Pass artifacts so lint's phase-artifact gap check (P2) reaches score + dashboard.
  const lint = lintMemory({ stateText, present, phaseArtifact: PHASE_ARTIFACT, artifacts });
  const { findings, suppressed } = runSecurity(".");
  const score = scoreProject({
    state,
    present,
    lint,
    security: findings,
    artifacts,
    decisions: artifacts["DECISIONS.md"] || "",
    issues: artifacts["ISSUES.md"] || "",
  });
  const telemetry = loadTelemetrySummary();
  const goals = loadGoals();
  const verify = loadVerify();
  const issues = parseIssues(artifacts["ISSUES.md"] || "");
  const decisions = artifacts["DECISIONS.md"] || "";
  const learnings = artifacts["LEARNINGS.md"] || "";
  const runlog = loadRunLog();
  return { state, artifacts, score, security: { findings, suppressed }, projectName: basename(resolve(".")), telemetry, goals, verify, issues, decisions, learnings, runlog };
}
