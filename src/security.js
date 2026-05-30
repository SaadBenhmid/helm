import { createHash } from "node:crypto";

// Pure, zero-dependency, offline security scanner for a project's source files.
// Mirrors the gitleaks engine shape: keyword/regex match → suppression → finding.
// No live-credential verification (that needs network); detection only.
//
// scanSecrets({ files })  — files is { "relative/path": "contents" }.
// scanHygiene({ paths, gitignore }) — repo-level checks (e.g. .env not ignored).
// scanSecurity({ files, paths, gitignore }) — both, merged.
//
// A finding: { level: "block" | "warn", file, line, rule, hint, fingerprint }.
// "block" findings should stop a ship; "warn" findings inform but never block.

// High-signal credential shapes. Low false-positive — these block by default.
const SECRET_RULES = [
  { id: "private-key", re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/, hint: "private key committed in source" },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/, hint: "AWS access key id" },
  { id: "gcp-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, hint: "Google API key" },
  { id: "google-oauth-secret", re: /\bGOCSPX-[0-9A-Za-z_-]{28}\b/, hint: "Google OAuth client secret" },
  { id: "stripe-live", re: /\b[rs]k_live_[0-9a-zA-Z]{20,}\b/, hint: "Stripe live key" },
  { id: "anthropic", re: /\bsk-ant-[0-9A-Za-z_-]{20,}\b/, hint: "Anthropic API key" },
  { id: "openai", re: /\bsk-(?:proj-)?[0-9A-Za-z]{32,}\b/, hint: "OpenAI API key" },
  { id: "github-token", re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/, hint: "GitHub token" },
  { id: "slack-token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, hint: "Slack token" },
  { id: "sendgrid", re: /\bSG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}\b/, hint: "SendGrid API key" },
  { id: "db-conn-string", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:'"@/]+:[^\s:'"@/]+@/, hint: "database connection string with inline password" },
];

// Lower-confidence heuristics — warn only (high false-positive in real code).
const WARN_RULES = [
  { id: "hardcoded-secret", re: /(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)["']?\s*[:=]\s*["'][^"'\s$]{8,}["']/i, hint: "possible hardcoded credential — move to an env var" },
  { id: "open-cors", re: /origin\s*:\s*["']\*["']|access-control-allow-origin["'\s:]+\*/i, hint: "CORS allows any origin (*)" },
  { id: "dangerous-eval", re: /\beval\s*\(|new Function\s*\(|dangerouslySetInnerHTML/, hint: "dynamic code/HTML execution — injection/XSS risk" }, // gitleaks:allow
];

// JWTs are only flagged when the payload is a Supabase service_role key (a real
// leak); anon JWTs are meant to be public, so plain JWT shape is not flagged.
const JWT_RE = /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/g;

// Substrings that mark a match as illustrative rather than a real secret.
const STOPWORDS = [
  "example", "sample", "placeholder", "changeme", "your_key", "your-key",
  "xxxxxxxx", "dummy", "redacted", "process.env", "import.meta.env",
  "os.environ", "getenv(",
];

// A secret on one of these paths/lines ships to the browser → force block.
const CLIENT_PATH = /(^|\/)(public|dist|build|out|static)\//i;
const CLIENT_ENV = /\b(?:NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_)/;

// Quoted angle-bracket placeholder like "<your-api-key>" — a doc/template stub, not a secret.
const PLACEHOLDER = /["']<[^"']*>["']/;

function fingerprint(rule, file, line, snippet) {
  return createHash("sha1").update(`${rule}:${file}:${line}:${snippet}`).digest("hex").slice(0, 12);
}

function hasStopword(line) {
  const low = line.toLowerCase();
  return STOPWORDS.some((w) => low.includes(w));
}

function isServiceRoleJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && payload.role === "service_role";
  } catch {
    return false; // not a decodable JSON payload → not a service_role JWT
  }
}

function emit(findings, { level, file, line, rule, hint, snippet, clientExposed }) {
  let lvl = level;
  let id = rule;
  let h = hint;
  if (clientExposed) {
    lvl = "block";
    id = `${rule}+client-exposed`;
    h = `${hint} — exposed in client bundle (ships to browser)`;
  }
  findings.push({ level: lvl, file, line, rule: id, hint: h, fingerprint: fingerprint(id, file, line, snippet) });
}

export function scanSecrets({ files = {} } = {}) {
  const findings = [];
  for (const [file, content] of Object.entries(files)) {
    if (typeof content !== "string") continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw;
      const lineNo = i + 1;
      if (/gitleaks:allow|helm:allow-secret/.test(line)) return; // inline suppression (all rules)
      const clientExposed = CLIENT_PATH.test(file) || CLIENT_ENV.test(line);

      // Block rules run unconditionally — a stopword/placeholder must never mask a real
      // credential (false negatives are the worst outcome for this gate).
      for (const rule of SECRET_RULES) {
        const m = line.match(rule.re);
        if (!m) continue;
        emit(findings, { level: "block", file, line: lineNo, rule: rule.id, hint: rule.hint, snippet: m[0], clientExposed });
      }

      for (const m of line.matchAll(JWT_RE)) {
        if (isServiceRoleJwt(m[0])) {
          emit(findings, { level: "block", file, line: lineNo, rule: "supabase-service-role", hint: "Supabase service_role key (full DB access)", snippet: m[0], clientExposed });
        }
      }

      // Heuristic warn rules are noisy, so they DO skip illustrative/example/placeholder lines.
      if (hasStopword(line) || PLACEHOLDER.test(line)) return;
      for (const rule of WARN_RULES) {
        const m = line.match(rule.re);
        if (!m) continue;
        emit(findings, { level: "warn", file, line: lineNo, rule: rule.id, hint: rule.hint, snippet: m[0], clientExposed });
      }
    });
  }
  return findings;
}

// Real secret-bearing dotenv files (not the committed .example/.sample templates).
const REAL_ENV = /(^|\/)\.env(\.(local|development|dev|production|prod|staging|test))?$/;
const TEMPLATE_ENV = /\.(example|sample|template|dist)$/;

export function scanHygiene({ paths = [], gitignore = "" } = {}) {
  const findings = [];
  const ignoredLines = gitignore.split(/\r?\n/).map((s) => s.trim());
  const ignoresEnv = ignoredLines.some((l) => [".env", ".env*", ".env.*", "*.env"].includes(l));

  for (const p of paths) {
    const rel = p.split("\\").join("/");
    if (!REAL_ENV.test(rel) || TEMPLATE_ENV.test(rel)) continue;
    if (ignoresEnv || ignoredLines.includes(rel)) continue;
    findings.push({
      level: "warn",
      file: rel,
      line: 0,
      rule: "env-not-ignored",
      hint: `${rel} is not in .gitignore — secrets risk being committed`,
      fingerprint: fingerprint("env-not-ignored", rel, 0, ""),
    });
  }
  return findings;
}

export function scanSecurity({ files = {}, paths = [], gitignore = "" } = {}) {
  return [...scanSecrets({ files }), ...scanHygiene({ paths, gitignore })];
}
