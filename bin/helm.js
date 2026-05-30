#!/usr/bin/env node
import { join, dirname, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, lstatSync } from "node:fs";
import { readState, writeState, defaultState, advanceState, startMilestone } from "../src/state.js";
import { nextAction } from "../src/router.js";
import { renderStateMd, renderHandoff } from "../src/render.js";
import { snapshot, rollback } from "../src/snapshot.js";
import { mergeHooks } from "../src/hooks.js";
import { lintMemory } from "../src/lint.js";
import { scanSecurity } from "../src/security.js";
import { scoreProject } from "../src/score.js";
import { renderDashboard } from "../src/dashboard.js";
import { ensureGitignored, kimiEnvExample, KIMI_LAUNCHER_PS1, KIMI_LAUNCHER_SH } from "../src/models.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELM_DIR = ".helm";
const STATE_PATH = join(HELM_DIR, "state.json");
const CONFIG_PATH = join(HELM_DIR, "helm.config.json");
const SNAP_ROOT = join(HELM_DIR, "snapshots");
const HANDOFF_PATH = join(HELM_DIR, "handoff.md");
const SETTINGS_PATH = join(".claude", "settings.json");
const CORE_PATHS = ["src", "bin", "skills", "templates", "CLAUDE.md", CONFIG_PATH];

function ensureInit() {
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
function collectRepo(root) {
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

function runSecurity(root = ".") {
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

function printFinding(f) {
  const tag = f.level === "block" ? "🛑 BLOCK" : "⚠ WARN ";
  const loc = f.line ? `${f.file}:${f.line}` : f.file;
  console.log(`${tag} ${loc}  [${f.rule}] ${f.hint}  (${f.fingerprint})`);
}

const ARTIFACT_FILES = ["VALIDATION.md", "PRD.md", "DESIGN.md", "SHIP.md", "CODEBASE.md", "DECISIONS.md", "ISSUES.md", "LEARNINGS.md", "handoff.md"];

// Gather everything the scorecard + dashboard need from .helm/ and the repo (read-only).
function gatherProject() {
  ensureInit();
  const state = readState(STATE_PATH);
  const present = readdirSync(HELM_DIR).filter((f) => statSync(join(HELM_DIR, f)).isFile());
  const stateText = readFileSync(STATE_PATH, "utf8");
  const lint = lintMemory({ stateText, present });
  const { findings, suppressed } = runSecurity(".");
  const artifacts = {};
  for (const n of ARTIFACT_FILES) {
    const p = join(HELM_DIR, n);
    if (existsSync(p)) artifacts[n] = readFileSync(p, "utf8");
  }
  const score = scoreProject({
    state,
    present,
    lint,
    security: findings,
    artifacts,
    decisions: artifacts["DECISIONS.md"] || "",
    issues: artifacts["ISSUES.md"] || "",
  });
  return { state, artifacts, score, security: { findings, suppressed }, projectName: basename(resolve(".")) };
}

const cmd = process.argv[2];

if (cmd === "init") {
  // Install bundled assets from the package into the current project (idempotent).
  // Includes bin + src so the runtime is local after one bootstrap (no re-download).
  for (const asset of ["CLAUDE.md", "skills", "templates", "bin", "src"]) {
    const src = join(PKG_ROOT, asset);
    const dest = resolve(asset);
    if (existsSync(src) && resolve(src) !== dest) {
      cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
    }
  }
  mkdirSync(HELM_DIR, { recursive: true });
  // Project type: `--existing` (brownfield, starts at Adopt) or default `new` (greenfield).
  const projectType = process.argv.includes("--existing") ? "existing" : "new";
  if (!existsSync(STATE_PATH)) writeState(STATE_PATH, defaultState(projectType));
  if (!existsSync(CONFIG_PATH)) copyFileSync(join(PKG_ROOT, "templates", "helm.config.json"), CONFIG_PATH);
  // Seed the append-only memory logs so memory exists from the very first phase.
  for (const mem of ["DECISIONS.md", "ISSUES.md", "LEARNINGS.md"]) {
    const dst = join(HELM_DIR, mem);
    const srcTpl = join(PKG_ROOT, "templates", mem);
    if (!existsSync(dst) && existsSync(srcTpl)) copyFileSync(srcTpl, dst);
  }
  // Autopilot: install the memory hooks now so context survives auto-compaction with
  // zero user action. Skip (don't clobber) if existing settings.json is malformed.
  let settings = {};
  let settingsOk = true;
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      settingsOk = false;
      console.warn(".claude/settings.json is invalid JSON — skipping hook install. Run `helm hooks install` after fixing it.");
    }
  }
  if (settingsOk) {
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(settings), null, 2) + "\n");
  }
  console.log(`Helm initialized (${projectType} project): .helm/ + memory hooks installed, skills + CLAUDE.md ready.`);
} else if (cmd === "status" || cmd === "next") {
  ensureInit();
  const state = readState(STATE_PATH);
  console.log(renderStateMd(state, nextAction(state)));
} else if (cmd === "advance") {
  ensureInit();
  const state = readState(STATE_PATH);
  // Security gate: leaving the ship phase requires a clean secret scan (or an audited --force).
  if (state.currentPhase === "ship") {
    const force = process.argv.includes("--force");
    const { findings, suppressed } = runSecurity(".");
    if (suppressed) console.warn(`ℹ ${suppressed} line(s) suppressed via gitleaks:allow — confirm they aren't hiding real secrets.`);
    const blockers = findings.filter((f) => f.level === "block");
    if (blockers.length) {
      if (!force) {
        console.error("🔐 Ship blocked — security scan found secrets/insecure config:\n");
        for (const f of findings) printFinding(f);
        console.error(`\n${blockers.length} blocking finding(s). Fix them, or override (your responsibility) with: helm advance --force`);
        process.exit(1);
      }
      // Audited override: record what was waved through, with fingerprints.
      const decisions = join(HELM_DIR, "DECISIONS.md");
      if (!existsSync(decisions)) {
        writeFileSync(decisions, "# Decisions Log\n\n| Date | Decision | Why | Phase |\n|------|----------|-----|-------|\n");
      }
      const date = new Date().toISOString().slice(0, 10);
      const fps = blockers.map((f) => f.fingerprint).join(", ");
      appendFileSync(decisions, `| ${date} | Security gate overridden (--force): shipped past ${blockers.length} blocker(s) [${fps}] | explicit user override | ship |\n`);
      console.warn(`⚠ Overriding ${blockers.length} security blocker(s) via --force — logged to DECISIONS.md.`);
    }
  }
  const updated = advanceState(state);
  writeState(STATE_PATH, updated);
  console.log(renderStateMd(updated, nextAction(updated)));
} else if (cmd === "security") {
  const { findings, suppressed } = runSecurity(".");
  if (findings.length === 0) {
    console.log("Security scan clean. ✅");
  } else {
    for (const f of findings) printFinding(f);
    const blockers = findings.filter((f) => f.level === "block").length;
    const warns = findings.length - blockers;
    console.log(`\n${blockers} blocking, ${warns} warning finding(s). Suppress a false positive with a \`gitleaks:allow\` comment on the line.`);
  }
  if (suppressed) console.log(`ℹ ${suppressed} line(s) suppressed via gitleaks:allow — confirm they aren't hiding real secrets.`);
  if (findings.some((f) => f.level === "block")) process.exit(1);
} else if (cmd === "score") {
  const { score, projectName } = gatherProject();
  console.log(`\nHelm scorecard — ${projectName}`);
  console.log(`Grade ${score.grade}   ${score.total}/100\n`);
  for (const d of score.dimensions) {
    const ratio = d.max ? d.score / d.max : 0;
    const filled = Math.round(ratio * 16);
    const bar = "█".repeat(filled) + "░".repeat(16 - filled);
    console.log(`  ${d.name.padEnd(22)} ${bar} ${String(d.score).padStart(2)}/${d.max}  ${d.detail}`);
  }
  console.log(`\n  Not yet proven (needs verify + deploy):`);
  for (const p of score.pending) console.log(`   ○ ${p.name} — ${p.why}`);
  console.log("");
} else if (cmd === "dashboard") {
  const g = gatherProject();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const html = renderDashboard({
    state: g.state,
    score: g.score,
    security: g.security,
    artifacts: g.artifacts,
    projectName: g.projectName,
    generatedAt: stamp,
  });
  const arg = process.argv[3];
  const out = arg && !arg.startsWith("-") ? arg : "helm-dashboard.html";
  writeFileSync(out, html);
  console.log(`Dashboard written: ${out} — open it in a browser. (read-only snapshot)`);
} else if (cmd === "milestone") {
  ensureInit();
  try {
    const updated = startMilestone(readState(STATE_PATH));
    writeState(STATE_PATH, updated);
    console.log(`Starting milestone ${updated.milestone}.`);
    console.log(renderStateMd(updated, nextAction(updated)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else if (cmd === "hooks") {
  if (process.argv[3] === "install") {
    let existing = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        existing = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
      } catch {
        console.error(".claude/settings.json is not valid JSON — fix or remove it, then re-run.");
        process.exit(1);
      }
    }
    mkdirSync(".claude", { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(mergeHooks(existing), null, 2) + "\n");
    console.log("Helm hooks installed in .claude/settings.json (SessionStart, SessionEnd, PreCompact).");
  } else {
    console.log("Usage: helm hooks install");
  }
} else if (cmd === "inject") {
  // SessionStart hook: print current state into the new session. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const state = readState(STATE_PATH);
      console.log(renderStateMd(state, nextAction(state)));
    } else {
      console.log("Helm is present but not initialized. Run: node bin/helm.js init");
    }
  } catch {
    /* never block a session on a hook error */
  }
} else if (cmd === "capture") {
  // SessionEnd / PreCompact hook: write a handoff so nothing is lost. Never fails the hook.
  try {
    if (existsSync(STATE_PATH)) {
      const ri = process.argv.indexOf("--reason");
      const reason = ri > -1 && process.argv[ri + 1] ? process.argv[ri + 1] : "manual";
      const state = readState(STATE_PATH);
      writeFileSync(HANDOFF_PATH, renderHandoff(state, reason, nextAction(state).message));
      console.log(`Helm captured handoff (${reason}).`);
    }
  } catch {
    /* never block a session on a hook error */
  }
} else if (cmd === "models") {
  if (process.argv[3] === "init") {
    const gi = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
    writeFileSync(".gitignore", ensureGitignored(gi, ".env.helm"));
    if (!existsSync(".env.helm.example")) writeFileSync(".env.helm.example", kimiEnvExample());
    mkdirSync("scripts", { recursive: true });
    if (!existsSync(join("scripts", "helm-kimi.ps1"))) writeFileSync(join("scripts", "helm-kimi.ps1"), KIMI_LAUNCHER_PS1);
    if (!existsSync(join("scripts", "helm-kimi.sh"))) writeFileSync(join("scripts", "helm-kimi.sh"), KIMI_LAUNCHER_SH);
    console.log("Model env scaffolding ready: .env.helm.example + scripts/helm-kimi.(ps1|sh). `.env.helm` is git-ignored.");
    console.log("Next: copy .env.helm.example to .env.helm, add your Moonshot key, then launch builds with scripts/helm-kimi.ps1 (Windows) or scripts/helm-kimi.sh.");
  } else {
    console.log("Usage: helm models init");
  }
} else if (cmd === "lint") {
  ensureInit();
  const present = readdirSync(HELM_DIR).filter((f) => statSync(join(HELM_DIR, f)).isFile());
  const stateText = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, "utf8") : null;
  const findings = lintMemory({ stateText, present });
  if (findings.length === 0) {
    console.log("Memory looks healthy. ✅");
  } else {
    for (const f of findings) console.log(`${f.level === "error" ? "✖ ERROR" : "⚠ WARN"}  ${f.msg}`);
  }
  if (findings.some((f) => f.level === "error")) process.exit(1);
} else if (cmd === "snapshot") {
  ensureInit();
  const id = snapshot(".", CORE_PATHS, SNAP_ROOT, process.argv[3] || "manual");
  console.log(`Snapshot created: ${id}`);
} else if (cmd === "rollback") {
  ensureInit();
  const id = rollback(".", SNAP_ROOT, process.argv[3]);
  console.log(`Rolled back to: ${id}`);
} else {
  console.log("Usage: helm <init [--existing]|status|next|advance [--force]|milestone|hooks install|models init|inject|capture|lint|security|score|dashboard [out.html]|snapshot [label]|rollback [id]>");
}
