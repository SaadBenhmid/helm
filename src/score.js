import { orderFor } from "./state.js";

// Pure project scorecard — "is Helm doing good?" Measures process health against
// Helm's promise, and is HONEST about what it cannot yet measure (outcome metrics
// like a live deploy) by listing them as pending rather than silently passing.
//
// scoreProject(input) → { total, grade, dimensions:[{name,score,max,detail}], pending:[{name,why}] }
// All inputs are plain data so the function stays pure and testable.

export function gradeFor(total) {
  if (total >= 90) return "A";
  if (total >= 80) return "B";
  if (total >= 70) return "C";
  if (total >= 60) return "D";
  return "F";
}

// A real artifact is more than a copied template: not an angle-bracket placeholder
// (e.g. "<Product Name>") and past a minimum of genuine content.
const PLACEHOLDER = /<[A-Za-z][^>]*>/;
function isRealArtifact(content) {
  if (typeof content !== "string") return false;
  const body = content.trim();
  if (body.length < 100) return false; // near-empty isn't a real artifact
  if (PLACEHOLDER.test(body)) return false; // an unfilled template stub
  return true;
}

// A markdown table has "real" rows when, after a header + |---| separator, there is at
// least one body pipe-row with non-empty cells. Positional (not a header allowlist) so
// tables with any column names are handled correctly.
function tableHasRows(md) {
  if (typeof md !== "string") return false;
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const isPipe = /^\s*\|.*\|\s*$/.test(lines[i]);
    const sepNext = i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]);
    if (!isPipe || !sepNext) continue;
    let j = i + 2; // first body row
    while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
      const cells = lines[j].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (cells.some((c) => c !== "")) return true;
      j++;
    }
    i = j - 1;
  }
  return false;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function scoreProject({
  state = {},
  present = [],
  lint = [],
  security = [],
  artifacts = {},
  decisions = "",
  issues = "",
} = {}) {
  const dimensions = [];

  // 1) Journey progress — fraction of phases complete (max 20).
  const order = orderFor(state);
  const phases = state.phases || {};
  const complete = order.filter((p) => phases[p] === "complete").length;
  const progress = order.length ? complete / order.length : 0;
  dimensions.push({
    name: "Journey progress",
    score: Math.round(progress * 20),
    max: 20,
    detail: `${complete}/${order.length} phases complete`,
  });

  // 2) Memory integrity — clean lint (max 15): -5 per error, -1 per warning.
  const errors = lint.filter((f) => f.level === "error").length;
  const warns = lint.filter((f) => f.level === "warn").length;
  dimensions.push({
    name: "Memory integrity",
    score: clamp(15 - errors * 5 - warns * 1, 0, 15),
    max: 15,
    detail: errors || warns ? `${errors} error(s), ${warns} warning(s)` : "memory logs healthy",
  });

  // 3) Security — the safety promise, weighted heavily (max 30). Any leaked secret
  //    cuts deep; warnings nudge.
  const blockers = security.filter((f) => f.level === "block").length;
  const secWarns = security.filter((f) => f.level === "warn").length;
  dimensions.push({
    name: "Security gate",
    score: clamp(30 - blockers * 15 - secWarns * 2, 0, 30),
    max: 30,
    detail: blockers ? `${blockers} blocking finding(s)` : secWarns ? `${secWarns} warning(s)` : "no secrets detected",
  });

  // 4) Artifact completeness — reached phases that produced a real (non-stub) artifact (max 20).
  const reached = order.filter((p) => phases[p] === "complete" || p === state.currentPhase);
  const artifactPhases = reached.filter((p) => ARTIFACT_FOR[p]); // phases that owe an artifact
  let realCount = 0;
  for (const p of artifactPhases) {
    if (isRealArtifact(artifacts[ARTIFACT_FOR[p]])) realCount++;
  }
  const artFrac = artifactPhases.length ? realCount / artifactPhases.length : 1;
  dimensions.push({
    name: "Artifact completeness",
    score: Math.round(artFrac * 20),
    max: 20,
    detail: `${realCount}/${artifactPhases.length} expected artifacts written`,
  });

  // 5) Decision trail — is memory actually being written (max 15)?
  const hasDecisions = tableHasRows(decisions);
  const hasIssues = tableHasRows(issues);
  const trailScore = (hasDecisions ? 10 : 0) + (hasIssues ? 5 : 0);
  dimensions.push({
    name: "Decision trail",
    score: trailScore,
    max: 15,
    detail: hasDecisions ? (hasIssues ? "decisions + issues logged" : "decisions logged") : "no decisions logged yet",
  });

  const total = dimensions.reduce((a, d) => a + d.score, 0);

  // Honest panel: the real promise (a non-technical user shipped a production-grade
  // product) needs outcome evidence Helm cannot yet generate. List, don't fake it.
  const pending = [
    { name: "Deployed", why: "no deploy step yet — can't confirm a live, reachable product" },
    { name: "Works (smoke test)", why: "the generated app isn't booted/smoke-tested by Helm yet" },
    { name: "Non-technical", why: "human-intervention count isn't tracked across a run yet" },
  ];

  return { total, grade: gradeFor(total), dimensions, pending };
}

// Which artifact each phase is expected to produce.
const ARTIFACT_FOR = {
  validate: "VALIDATION.md",
  prd: "PRD.md",
  mockup: "DESIGN.md",
  ship: "SHIP.md",
  adopt: "CODEBASE.md",
};

export { ARTIFACT_FOR, isRealArtifact };
