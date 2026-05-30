import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanSecrets, scanHygiene, scanSecurity } from "../src/security.js";

const REPO = process.cwd();

function blocks(findings) {
  return findings.filter((f) => f.level === "block");
}
function hasRule(findings, rule) {
  return findings.some((f) => f.rule.startsWith(rule));
}

// Fake-but-real-shaped secrets, ASSEMBLED FROM FRAGMENTS at runtime so no matchable
// secret literal is ever committed. This keeps GitHub push-protection / gitleaks (and
// Helm's own scanner) from flagging this test file, while detection is still exercised
// in-memory (the scanner sees the concatenated value, never the source).
const FAKE = {
  aws: "AKIA" + "1234567890ABCDEF",
  pem: "-----BEGIN RSA " + "PRIVATE KEY-----",
  stripe: "sk_" + "live_" + "abcdefGHIJKL0123456789xyz",
  openai: "sk-" + "abcdefGHIJKLmnopqrstuvwx0123456789ABCDEFGH",
  anthropic: "sk-" + "ant-" + "abcdefGHIJKLmnop0123456789QR",
  github: "ghp_" + "abcdefGHIJKLmnop0123456789ABCDEF0123",
  gcp: "AIza" + "SyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe",
  db: "postgres://admin:" + "supersecret" + "@db.internal.net:5432/app",
};

// A valid-shape Supabase service_role JWT (payload decodes to role: service_role).
const SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(JSON.stringify({ role: "service_role", iss: "supabase" })).toString("base64url") +
  ".s1gn4tures1gn4tures1gn4ture";
// An anon JWT (role: anon) must NOT block.
const ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(JSON.stringify({ role: "anon", iss: "supabase" })).toString("base64url") +
  ".s1gn4tures1gn4tures1gn4ture";

test("clean source yields no findings", () => {
  const f = scanSecrets({ files: { "app.js": "const x = 1;\nconst key = process.env.API_KEY;\n" } });
  assert.equal(f.length, 0);
});

test("block rules fire on real-shape secrets", () => {
  const cases = {
    "aws.js": `const id = "${FAKE.aws}";`,
    "key.pem": `${FAKE.pem}\nMIIE...\n`,
    "stripe.js": `const s = "${FAKE.stripe}";`,
    "openai.js": `const o = "${FAKE.openai}";`,
    "anthropic.js": `const a = "${FAKE.anthropic}";`,
    "gh.js": `const t = "${FAKE.github}";`,
    "gcp.js": `const g = "${FAKE.gcp}";`,
    "db.js": `const u = "${FAKE.db}";`,
  };
  for (const [file, content] of Object.entries(cases)) {
    const f = scanSecrets({ files: { [file]: content } });
    assert.ok(blocks(f).length >= 1, `expected a block finding for ${file}`);
  }
});

test("supabase service_role JWT blocks; anon JWT does not", () => {
  const blocked = scanSecrets({ files: { "sb.js": `const sr = "${SERVICE_ROLE_JWT}";` } });
  assert.ok(hasRule(blocked, "supabase-service-role"), "service_role JWT should block");

  const anon = scanSecrets({ files: { "sb.js": `const anon = "${ANON_JWT}";` } });
  assert.equal(blocks(anon).length, 0, "anon JWT must not block");
});

test("warn rules fire but do not block", () => {
  const f = scanSecrets({
    files: {
      "cfg.js": 'const password = "hunter2hunter2";\nconst opts = { origin: "*" };\neval(userInput);\n', // gitleaks:allow
    },
  });
  assert.equal(blocks(f).length, 0, "heuristics must not block");
  assert.ok(f.some((x) => x.level === "warn"), "expected warn findings");
  assert.ok(hasRule(f, "hardcoded-secret"));
  assert.ok(hasRule(f, "open-cors"));
  assert.ok(hasRule(f, "dangerous-eval"));
});

test("stopwords suppress warn heuristics but NEVER mask a block-level secret", () => {
  // Heuristic warn on an example line → suppressed.
  const warn = scanSecrets({ files: { "ex.js": 'const password = "examplepassword123";' } });
  assert.equal(warn.length, 0, "example/placeholder warn values should be ignored");

  // A real-shape AWS key on a line that also says "example" must still BLOCK.
  const real = scanSecrets({ files: { "ex.js": `const id = "${FAKE.aws}"; /* example */` } });
  assert.ok(blocks(real).length >= 1, "a stopword must not mask a real credential");
});

test("gitleaks:allow suppresses a line", () => {
  const f = scanSecrets({
    files: { "x.js": `const id = "${FAKE.aws}"; // gitleaks:allow` },
  });
  assert.equal(f.length, 0);
});

test("secret in a client bundle path is force-elevated to block", () => {
  // hardcoded-secret is normally a warn; in a client path it must block (ships to browser).
  const f = scanSecrets({
    files: { "public/config.js": 'const apiKey = "abcdef0123456789abcdef";' }, // gitleaks:allow
  });
  assert.ok(blocks(f).length >= 1, "client-exposed secret must block");
  assert.ok(f.some((x) => /client-exposed/.test(x.rule)));
});

test("NEXT_PUBLIC_ prefix elevates a secret to block", () => {
  const f = scanSecrets({
    files: { "src/env.js": `const NEXT_PUBLIC_STRIPE_KEY = "${FAKE.stripe}";` },
  });
  assert.ok(blocks(f).some((x) => /client-exposed/.test(x.rule)));
});

test("findings are deterministic (stable fingerprints)", () => {
  const files = { "aws.js": `const id = "${FAKE.aws}";` };
  const a = scanSecrets({ files });
  const b = scanSecrets({ files });
  assert.deepEqual(a, b);
  assert.ok(a[0].fingerprint && a[0].fingerprint.length >= 8);
});

test("scanHygiene flags an unignored .env", () => {
  const flagged = scanHygiene({ paths: ["src/app.js", ".env"], gitignore: "node_modules/\n" });
  assert.ok(flagged.some((x) => x.rule === "env-not-ignored" && x.level === "warn"));

  const ok = scanHygiene({ paths: ["src/app.js", ".env"], gitignore: "node_modules/\n.env\n" });
  assert.equal(ok.length, 0);

  const example = scanHygiene({ paths: [".env.example"], gitignore: "" });
  assert.equal(example.length, 0, ".env.example is not a secret file");
});

test("scanSecurity merges secret + hygiene findings", () => {
  const f = scanSecurity({
    files: { "a.js": `const id = "${FAKE.aws}";` },
    paths: ["a.js", ".env"],
    gitignore: "",
  });
  assert.ok(hasRule(f, "aws-access-key"));
  assert.ok(hasRule(f, "env-not-ignored"));
});

// ---- CLI integration ----

function run(args, cwd) {
  return execFileSync("node", [join(REPO, "bin", "helm.js"), ...args], { cwd, encoding: "utf8" });
}
function runExpectFail(args, cwd) {
  try {
    execFileSync("node", [join(REPO, "bin", "helm.js"), ...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { status: 0, output: "" };
  } catch (e) {
    return { status: e.status, output: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

test("CLI: helm security exits non-zero on a planted secret, clean otherwise", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-sec-"));
  writeFileSync(join(dir, "ok.js"), "const x = process.env.KEY;\n");
  const clean = run(["security"], dir);
  assert.match(clean, /clean/i);

  writeFileSync(join(dir, "leak.js"), `const id = "${FAKE.aws}";\n`);
  const bad = runExpectFail(["security"], dir);
  assert.equal(bad.status, 1);
  assert.match(bad.output, /AKIA|aws-access-key|BLOCK/);
});

// A real (non-stub) artifact body that passes isRealArtifact, so the artifact
// gate isn't what blocks these ship tests — the secret gate is.
const REAL_ARTIFACT =
  "# Ship\n\nThis is a genuine, sufficiently long ship artifact describing the release,\n" +
  "rollout plan, and verification done. It exists so the advance artifact gate passes.\n";

// Seed the ship-phase advance gates that are NOT under test here: a real SHIP.md
// and a passing verify.json. Lets the secret gate be the thing exercised.
function seedShipGates(dir) {
  writeFileSync(join(dir, ".helm", "SHIP.md"), REAL_ARTIFACT);
  writeFileSync(
    join(dir, ".helm", "verify.json"),
    JSON.stringify({ passed: true, ranAt: new Date().toISOString(), checks: [] })
  );
}

function jumpToShip(dir) {
  const shipState = {
    projectType: "new",
    currentPhase: "ship",
    phaseStatus: "in_progress",
    milestone: 1,
    phases: { validate: "complete", prd: "complete", mockup: "complete", setup: "complete", build: "complete", ship: "in_progress" },
  };
  writeFileSync(join(dir, ".helm", "state.json"), JSON.stringify(shipState));
}

test("CLI: ship advance is blocked by a secret and overridable with --force", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-gate-"));
  run(["init"], dir);
  jumpToShip(dir);
  seedShipGates(dir); // pass the artifact + verify gates so the secret gate is what blocks
  writeFileSync(join(dir, "leak.js"), `const id = "${FAKE.aws}";\n`);

  const blocked = runExpectFail(["advance"], dir);
  assert.equal(blocked.status, 1);
  assert.match(blocked.output, /blocked|BLOCK/i);

  const forced = run(["advance", "--force"], dir);
  assert.match(forced, /complete/i);
  const decisions = readFileSync(join(dir, ".helm", "DECISIONS.md"), "utf8");
  assert.match(decisions, /override/i, "override must be logged to DECISIONS.md");
});

// ---- Enforcement gates (Batch 2) ----

test("CLI: advance is blocked when the phase artifact is missing, allowed with --force", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-art-"));
  run(["init"], dir); // greenfield: starts at validate, owes VALIDATION.md

  const blocked = runExpectFail(["advance"], dir);
  assert.equal(blocked.status, 1);
  assert.match(blocked.output, /Cannot advance/);
  assert.match(blocked.output, /VALIDATION\.md/);

  const forced = run(["advance", "--force"], dir);
  assert.match(forced, /PRD/); // moved on to the next phase
});

test("CLI: advance is blocked when the phase artifact is a stub", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-stub-"));
  run(["init"], dir);
  // A copied-template stub: contains an angle-bracket placeholder → not a real artifact.
  writeFileSync(join(dir, ".helm", "VALIDATION.md"), "# Validation\n\n<Problem statement>\n");
  const blocked = runExpectFail(["advance"], dir);
  assert.equal(blocked.status, 1);
  assert.match(blocked.output, /stub|placeholder/i);
});

test("CLI: advance is allowed when the phase artifact is real", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-real-"));
  run(["init"], dir);
  writeFileSync(join(dir, ".helm", "VALIDATION.md"), REAL_ARTIFACT);
  const out = run(["advance"], dir);
  assert.match(out, /PRD/);
  const state = JSON.parse(readFileSync(join(dir, ".helm", "state.json"), "utf8"));
  assert.equal(state.currentPhase, "prd");
});

test("CLI: leaving ship requires a passing verify.json (overridable with --force)", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-verify-"));
  run(["init"], dir);
  jumpToShip(dir);
  // Real SHIP.md so the artifact gate passes, but NO verify.json → verify gate blocks.
  writeFileSync(join(dir, ".helm", "SHIP.md"), REAL_ARTIFACT);

  const blocked = runExpectFail(["advance"], dir);
  assert.equal(blocked.status, 1);
  assert.match(blocked.output, /verif/i);

  const forced = run(["advance", "--force"], dir);
  assert.match(forced, /complete/i);
  const decisions = readFileSync(join(dir, ".helm", "DECISIONS.md"), "utf8");
  assert.match(decisions, /verify gate overridden/i);
});

test("CLI: init --dry-run prints a write plan and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "helm-dry-"));
  const out = run(["init", "--dry-run"], dir);
  assert.match(out, /WRITE PLAN/);
  assert.match(out, /state\.json/);
  assert.equal(existsSync(join(dir, ".helm")), false, "dry run must not create .helm");
  assert.equal(existsSync(join(dir, ".claude")), false, "dry run must not create .claude");
});
