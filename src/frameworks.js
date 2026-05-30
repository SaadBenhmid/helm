// Pure helpers for Helm's AI-workflow-framework registry (templates/frameworks.json).
// The CLI reads/ranks/flags-staleness; the actual market research + rewrite is done by
// the helm-frameworks-refresh skill (only the agent can browse the web).
//
//   loadRegistry(text)            → parsed + validated registry
//   scoreFrameworks(reg, signals) → ranked [{ id, name, score, why[] }]
//   isStale(reg, today, maxDays)  → boolean (registry knowledge gone stale)

const RATE = { best: 2, ok: 1, poor: -1 };   // fit ratings → points
const LEVEL = { low: 0, medium: 1, high: 2 }; // ordinal levels for rigor / ui

const RATINGS = new Set(["best", "ok", "poor"]);
const LEVELS = new Set(["low", "medium", "high"]);

export function validateRegistry(reg) {
  if (!reg || typeof reg !== "object") throw new Error("registry must be an object");
  if (!Array.isArray(reg.frameworks) || reg.frameworks.length === 0) {
    throw new Error("registry.frameworks must be a non-empty array");
  }
  for (const fw of reg.frameworks) {
    if (!fw || !fw.id || !fw.name) throw new Error("each framework needs an id and name");
    const fit = fw.fit;
    if (!fit || typeof fit !== "object") throw new Error(`framework "${fw.id}" is missing fit signals`);
    // Validate the fit shape so a hand- or agent-edited registry fails loudly, not silently mis-scores.
    for (const dim of ["size", "team"]) {
      if (!fit[dim] || typeof fit[dim] !== "object") throw new Error(`framework "${fw.id}" fit.${dim} must be an object of ratings`);
      for (const [k, v] of Object.entries(fit[dim])) {
        if (!RATINGS.has(v)) throw new Error(`framework "${fw.id}" fit.${dim}.${k} must be best|ok|poor (got "${v}")`);
      }
    }
    for (const dim of ["rigor", "ui"]) {
      if (!LEVELS.has(fit[dim])) throw new Error(`framework "${fw.id}" fit.${dim} must be low|medium|high (got "${fit[dim]}")`);
    }
  }
  return true;
}

export function loadRegistry(textOrObj) {
  const reg = typeof textOrObj === "string" ? JSON.parse(textOrObj) : textOrObj;
  validateRegistry(reg);
  return reg;
}

function ordinalScore(fwLevel, wantLevel) {
  if (LEVEL[fwLevel] == null || LEVEL[wantLevel] == null) return null;
  return 2 - 2 * Math.abs(LEVEL[fwLevel] - LEVEL[wantLevel]); // match=+2, off-by-one=0, off-by-two=-2
}

// Rank frameworks against project signals. signals: { size, rigor, ui, team } (all optional).
// size/team are categorical (best/ok/poor); rigor/ui are ordinal (low/medium/high).
export function scoreFrameworks(registry, signals = {}) {
  const fws = (registry && registry.frameworks) || [];
  const scored = fws.map((fw) => {
    const fit = fw.fit || {};
    let score = 0;
    const why = [];

    if (signals.size && fit.size && fit.size[signals.size]) {
      const r = RATE[fit.size[signals.size]] ?? 0;
      score += r;
      why.push(`${fit.size[signals.size]} for ${signals.size} projects`);
    }
    if (signals.team && fit.team && fit.team[signals.team]) {
      const r = RATE[fit.team[signals.team]] ?? 0;
      score += r;
      why.push(`${fit.team[signals.team]} for a ${signals.team}`);
    }
    if (signals.rigor) {
      const r = ordinalScore(fit.rigor, signals.rigor);
      if (r != null) {
        score += r;
        why.push(r === 2 ? `matches ${signals.rigor} rigor` : `${fit.rigor} rigor vs wanted ${signals.rigor}`);
      }
    }
    if (signals.ui) {
      const r = ordinalScore(fit.ui, signals.ui);
      if (r != null) {
        score += r;
        why.push(r === 2 ? `matches ${signals.ui} UI weight` : `${fit.ui} UI vs wanted ${signals.ui}`);
      }
    }
    return { id: fw.id, name: fw.name, score, why };
  });

  // Sort by score desc; preserve registry order on ties (stable).
  return scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map((x) => x.s);
}

export function daysSince(dateStr, today) {
  const a = new Date(`${dateStr}T00:00:00Z`).getTime();
  const b = (today instanceof Date ? today : new Date(today)).getTime();
  return Math.floor((b - a) / 86400000);
}

export function isStale(registry, today, maxDays = 120) {
  if (!registry || !registry.lastVerified) return true;
  return daysSince(registry.lastVerified, today) > maxDays;
}
