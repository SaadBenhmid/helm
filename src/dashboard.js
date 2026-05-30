import { orderFor } from "./state.js";
import { buildBoard } from "./board.js";

// Pure renderers for Helm's read-only project dashboard.
//   mdToHtml(md)        — compact, safe markdown → HTML (headings/lists/tables/checkboxes).
//   renderDashboard(..) — a self-contained, light-theme "sea-chart" HTML document.
// No dependencies, no external assets required to function (web fonts degrade gracefully).

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline markdown on already-escaped text (so the ASCII markers survive escaping).
function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic only at word boundaries, so "3*4*5" and "src/*.js" aren't mangled.
    .replace(/(^|[^\w*])\*([^\s*][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
      // Only http(s) and relative/anchor links — never javascript:/data:/etc. And escape
      // quotes/backticks so a crafted URL can't break out of the href attribute (XSS).
      if (!(/^https?:\/\//i.test(href) || /^[#./]/.test(href))) return text;
      const safe = href.replace(/["'`]/g, (c) => ({ '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
      return `<a href="${safe}" rel="noopener noreferrer">${text}</a>`;
    });
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}
function renderTable(header, rows) {
  const th = header.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

export function mdToHtml(md) {
  if (!md) return "";
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inUl = false;
  const closeList = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table block: a pipe row followed by a |---|---| separator.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(renderTable(header, rows));
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(escapeHtml(h[2]))}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(escapeHtml(line.replace(/^\s*>\s?/, "")))}</blockquote>`);
      i++;
      continue;
    }

    const cb = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (cb) {
      if (!inUl) {
        out.push('<ul class="md-list">');
        inUl = true;
      }
      const checked = cb[1].toLowerCase() === "x" ? "checked" : "";
      out.push(`<li class="task"><input type="checkbox" class="checkbox" disabled ${checked}><span>${inline(escapeHtml(cb[2]))}</span></li>`);
      i++;
      continue;
    }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inUl) {
        out.push('<ul class="md-list">');
        inUl = true;
      }
      out.push(`<li>${inline(escapeHtml(li[1]))}</li>`);
      i++;
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p>${inline(escapeHtml(line))}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

// ---- Dashboard document ----

// Monochrome, text-presentation glyphs only (no emoji-variant chars that render in colour).
const PHASE_META = {
  validate: { label: "Validate", glyph: "◇", note: "go / pivot / kill" },
  prd: { label: "PRD", glyph: "▦", note: "the spec" },
  mockup: { label: "Mockup", glyph: "✦", note: "design identity" },
  setup: { label: "Setup", glyph: "◈", note: "scaffold + tooling" },
  build: { label: "Build", glyph: "◆", note: "slice-by-slice" },
  ship: { label: "Ship", glyph: "◉", note: "secure + deploy" },
  adopt: { label: "Adopt", glyph: "❖", note: "map the codebase" },
};

const ARTIFACT_META = {
  "PRD.md": { icon: "▦", label: "PRD", tag: "spec" },
  "VALIDATION.md": { icon: "◇", label: "Validation", tag: "validate" },
  "DESIGN.md": { icon: "✦", label: "Design", tag: "mockup" },
  "SHIP.md": { icon: "◉", label: "Ship checklist", tag: "ship" },
  "CODEBASE.md": { icon: "❖", label: "Codebase map", tag: "adopt" },
  "DECISIONS.md": { icon: "❡", label: "Decisions", tag: "memory" },
  "ISSUES.md": { icon: "◬", label: "Issues", tag: "memory" },
  "LEARNINGS.md": { icon: "✺", label: "Learnings", tag: "memory" },
  "handoff.md": { icon: "➜", label: "Handoff", tag: "memory" },
};
const ARTIFACT_ORDER = ["PRD.md", "VALIDATION.md", "DESIGN.md", "SHIP.md", "CODEBASE.md", "DECISIONS.md", "ISSUES.md", "LEARNINGS.md", "handoff.md"];

function barClass(ratio) {
  if (ratio >= 0.85) return "good";
  if (ratio >= 0.6) return "warn";
  return "bad";
}

function renderCourse(state) {
  const order = orderFor(state);
  const phases = state.phases || {};
  const stops = order
    .map((p) => {
      const status = phases[p] === "complete" ? "done" : p === state.currentPhase ? "current" : "todo";
      const m = PHASE_META[p] || { label: p, glyph: "•", note: "" };
      return `
      <li class="stop ${status}">
        <span class="stop-dot" aria-hidden="true">${escapeHtml(m.glyph)}</span>
        <span class="stop-label">${escapeHtml(m.label)}</span>
        <span class="stop-note">${status === "done" ? "charted" : status === "current" ? "on station" : escapeHtml(m.note)}</span>
      </li>`;
    })
    .join("");
  return `<ol class="course">${stops}</ol>`;
}

function renderScore(score) {
  const dims = (score.dimensions || [])
    .map((d) => {
      const ratio = d.max ? d.score / d.max : 0;
      return `
      <div class="dim">
        <div class="dim-head"><span>${escapeHtml(d.name)}</span><span class="dim-num">${d.score}<i>/${d.max}</i></span></div>
        <div class="bar"><span class="fill ${barClass(ratio)}" style="width:${Math.round(ratio * 100)}%"></span></div>
        <div class="dim-detail">${escapeHtml(d.detail || "")}</div>
      </div>`;
    })
    .join("");
  const pending = (score.pending || [])
    .map((p) => `<li><span class="pend-mark">○</span><b>${escapeHtml(p.name)}</b><span class="pend-why">${escapeHtml(p.why)}</span></li>`)
    .join("");
  const gradeClass = score.grade === "A" || score.grade === "B" ? "good" : score.grade === "C" ? "warn" : "bad";
  return `
  <section class="panel score-panel">
    <header class="panel-head"><h2>Scorecard</h2><span class="muted">process health vs the promise</span></header>
    <div class="score-body">
      <div class="medallion ${gradeClass}">
        <div class="grade">${escapeHtml(score.grade || "–")}</div>
        <div class="grade-total">${score.total ?? 0}<i>/100</i></div>
      </div>
      <div class="dims">${dims}</div>
    </div>
    <div class="pending">
      <h3>Not yet proven <span class="muted">— needs verify + deploy</span></h3>
      <ul>${pending}</ul>
    </div>
  </section>`;
}

function renderSecurity(security) {
  const findings = (security && security.findings) || [];
  const blockers = findings.filter((f) => f.level === "block").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  const suppressed = (security && security.suppressed) || 0;
  const ok = blockers === 0;
  return `
  <section class="panel sec-panel ${ok ? "good" : "bad"}">
    <header class="panel-head"><h2>Security gate</h2></header>
    <div class="sec-status">
      <span class="sec-chip ${ok ? "good" : "bad"}">${ok ? "✓ clean" : `✕ ${blockers} blocking`}</span>
      <span class="muted">${warns} warning(s)${suppressed ? ` · ${suppressed} suppressed` : ""}</span>
    </div>
    <p class="muted small">${ok ? "No leaked credentials detected. Ship gate is open." : "Ship is blocked until blocking findings are resolved."}</p>
  </section>`;
}

function renderArtifacts(artifacts, state) {
  const names = ARTIFACT_ORDER.filter((n) => artifacts[n] != null);
  const currentPhase = state.currentPhase;
  // Open the current phase's artifact if it has one, else the PRD, else the first card —
  // so a key document is visible without a click.
  const phaseArtifact = names.find((n) => (ARTIFACT_META[n] || {}).tag === currentPhase);
  const defaultOpen = phaseArtifact || (names.includes("PRD.md") ? "PRD.md" : names[0]);
  const cards = names
    .map((n) => {
      const m = ARTIFACT_META[n] || { icon: "•", label: n, tag: "" };
      const open = n === defaultOpen ? "open" : "";
      return `
      <details class="artifact" ${open}>
        <summary>
          <span class="art-icon" aria-hidden="true">${m.icon}</span>
          <span class="art-label">${escapeHtml(m.label)}</span>
          <span class="art-tag">${escapeHtml(m.tag)}</span>
          <span class="art-file">${escapeHtml(n)}</span>
        </summary>
        <div class="art-body md">${mdToHtml(artifacts[n])}</div>
      </details>`;
    })
    .join("");
  return `
  <section class="panel">
    <header class="panel-head"><h2>Project artifacts</h2><span class="muted">${names.length} document(s)</span></header>
    <div class="artifacts">${cards || '<p class="muted">No artifacts written yet.</p>'}</div>
  </section>`;
}

// ---- Tokens & credits ----

// Group thousands without a locale dependency (zero-dep, deterministic).
function groupThousands(n) {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return (neg ? "-" : "") + out;
}

// Money like $0.0123 — 4 decimals so tiny model spends stay legible.
function formatUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0.0000";
  const neg = v < 0;
  return (neg ? "-$" : "$") + Math.abs(v).toFixed(4);
}

function renderTelemetry(telemetry) {
  if (!telemetry) return "";
  const tokensIn = Number(telemetry.tokensIn) || 0;
  const tokensOut = Number(telemetry.tokensOut) || 0;
  const total = tokensIn + tokensOut;
  const usd = Number(telemetry.usd) || 0;
  const count = Number(telemetry.count) || 0;

  const byPhase = telemetry.byPhase && typeof telemetry.byPhase === "object" ? telemetry.byPhase : {};
  const phaseEntries = Object.keys(byPhase).map((k) => [k, Number(byPhase[k]) || 0]);
  const phaseMax = phaseEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const phaseRows = phaseEntries
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => {
      const ratio = phaseMax ? val / phaseMax : 0;
      const label = (PHASE_META[name] || {}).label || name;
      return `
      <div class="usage-row">
        <span class="usage-name">${escapeHtml(label)}</span>
        <span class="usage-bar"><span class="usage-fill" style="width:${Math.round(ratio * 100)}%"></span></span>
        <span class="usage-val mono">${groupThousands(val)}</span>
      </div>`;
    })
    .join("");

  const byModel = telemetry.byModel && typeof telemetry.byModel === "object" ? telemetry.byModel : {};
  const modelRows = Object.keys(byModel)
    .map((name) => `<li><span class="usage-name">${escapeHtml(name)}</span><span class="usage-val mono">${groupThousands(Number(byModel[name]) || 0)}</span></li>`)
    .join("");

  return `
  <section class="panel tokens-panel">
    <header class="panel-head"><h2>Tokens &amp; credits</h2><span class="muted">what this project has cost so far</span></header>
    <div class="tokens-top">
      <div class="tok-figure">
        <div class="tok-big mono">${groupThousands(total)}</div>
        <div class="tok-cap muted small">words processed (tokens)</div>
      </div>
      <div class="tok-figure">
        <div class="tok-big tok-usd mono">${escapeHtml(formatUsd(usd))}</div>
        <div class="tok-cap muted small">estimated spend</div>
      </div>
    </div>
    <div class="tok-sub muted small">${groupThousands(tokensIn)} in · ${groupThousands(tokensOut)} out${count ? ` · across ${groupThousands(count)} run(s)` : ""}</div>
    ${phaseRows ? `<div class="usage-block"><h3 class="usage-head">By phase</h3>${phaseRows}</div>` : ""}
    ${modelRows ? `<div class="usage-block"><h3 class="usage-head">By model</h3><ul class="usage-list">${modelRows}</ul></div>` : ""}
  </section>`;
}

// ---- Goals ----

function renderGoals(goals) {
  if (!goals) return "";
  const items = Array.isArray(goals.items) ? goals.items : [];
  const total = Number(goals.total) || items.length;
  const done = Number.isFinite(Number(goals.done))
    ? Number(goals.done)
    : items.filter((it) => it && it.done).length;
  const ratio = total ? Math.min(1, done / total) : 0;
  const rows = items
    .map((it) => {
      const checked = it && it.done ? "checked" : "";
      const cls = it && it.done ? "done" : "";
      return `<li class="task ${cls}"><input type="checkbox" class="checkbox" disabled ${checked}><span>${escapeHtml((it && it.text) || "")}</span></li>`;
    })
    .join("");
  return `
  <section class="panel goals-panel">
    <header class="panel-head"><h2>Goals</h2><span class="muted">${done}/${total} done</span></header>
    <div class="bar goals-bar"><span class="fill ${barClass(ratio)}" style="width:${Math.round(ratio * 100)}%"></span></div>
    <ul class="md-list goals-list">${rows || '<li class="muted">No goals set yet.</li>'}</ul>
  </section>`;
}

// ---- Verify ----

function renderVerify(verify) {
  if (!verify) {
    return `
  <section class="panel verify-panel">
    <header class="panel-head"><h2>Verify</h2></header>
    <p class="muted small">Not run yet — run <code>helm verify</code>.</p>
  </section>`;
  }
  const passed = !!verify.passed;
  const checks = Array.isArray(verify.checks) ? verify.checks : [];
  const rows = checks
    .map((c) => {
      const ok = !!(c && c.ok);
      return `
      <li class="verify-row">
        <span class="verify-mark ${ok ? "good" : "bad"}" aria-hidden="true">${ok ? "✓" : "✕"}</span>
        <span class="verify-name">${escapeHtml((c && c.name) || "")}</span>
        <span class="verify-detail muted">${escapeHtml((c && c.detail) || "")}</span>
      </li>`;
    })
    .join("");
  return `
  <section class="panel verify-panel ${passed ? "good" : "bad"}">
    <header class="panel-head"><h2>Verify</h2>${typeof verify.ranAt === "string" && verify.ranAt ? `<span class="muted small">ran ${escapeHtml(verify.ranAt)}</span>` : ""}</header>
    <div class="verify-status">
      <span class="verify-chip ${passed ? "good" : "bad"}">${passed ? "✓ passed" : "✕ failed"}</span>
    </div>
    <ul class="verify-list">${rows || '<li class="muted small">No checks recorded.</li>'}</ul>
  </section>`;
}

// ---- Jira-style board / issues / milestones / activity ----

function issueBadge(type) {
  const t = String(type || "").toLowerCase();
  const cls = t.includes("bug")
    ? "bad"
    : t.includes("add")
      ? "good"
      : t.includes("solved") || t.includes("done")
        ? "good"
        : t.includes("drop")
          ? "muted"
          : t.includes("goal")
            ? "ink"
            : "brass";
  return `<span class="badge ${cls}">${escapeHtml(type || "task")}</span>`;
}

function renderCard(c) {
  return `
      <div class="card">
        <div class="card-top"><span class="card-id mono">${escapeHtml(c.id || "")}</span>${issueBadge(c.badge)}</div>
        <div class="card-title">${escapeHtml(c.title || "")}</div>
        ${c.note ? `<div class="card-note muted small">${escapeHtml(c.note)}</div>` : ""}
      </div>`;
}

function renderColumn(title, cards) {
  return `
    <div class="bcol">
      <div class="bcol-head">${escapeHtml(title)}<span class="count">${cards.length}</span></div>
      <div class="bcol-body">${cards.map(renderCard).join("") || '<div class="empty muted small">Nothing here yet</div>'}</div>
    </div>`;
}

function renderBoard(board) {
  return `
  <div class="board">
    ${renderColumn("Backlog", board.backlog)}
    ${renderColumn("In progress", board.inProgress)}
    ${renderColumn("Done", board.done)}
  </div>`;
}

function renderBacklog(board) {
  const items = board.backlog || [];
  return `<div class="list">${items.map(renderCard).join("") || '<div class="muted">Backlog is empty — nothing waiting.</div>'}</div>`;
}

function renderIssues(issues) {
  const open = (issues && issues.open) || [];
  const solved = (issues && issues.solved) || [];
  const row = (i, kind) => `
      <div class="issue-row ${kind}">
        <span class="card-id mono">${escapeHtml(i.id || "")}</span>
        ${issueBadge(kind === "solved" ? "solved" : i.type)}
        <span class="issue-title">${escapeHtml(i.title || "")}</span>
        <span class="issue-meta muted small">${escapeHtml(kind === "solved" ? `${i.fix || ""}${i.date ? " · " + i.date : ""}` : i.notes || "")}</span>
      </div>`;
  const openRows = open.map((i) => row(i, "open")).join("") || '<div class="muted small">No open issues.</div>';
  const solvedRows = solved.map((i) => row(i, "solved")).join("") || '<div class="muted small">None solved yet.</div>';
  return `
  <div class="issues">
    <h3 class="sub">Open <span class="count">${open.length}</span></h3>
    ${openRows}
    <h3 class="sub spaced">Solved <span class="count">${solved.length}</span></h3>
    ${solvedRows}
  </div>`;
}

function renderMilestones(state) {
  const order = orderFor(state);
  const phases = state.phases || {};
  const completed = order.filter((p) => phases[p] === "complete").length;
  const rows = order
    .map((p) => {
      const status = phases[p] === "complete" ? "done" : p === state.currentPhase ? "current" : "todo";
      const m = PHASE_META[p] || { label: p, glyph: "•" };
      const word = status === "done" ? "done" : status === "current" ? "in progress" : "to do";
      return `
      <div class="ms-row ${status}">
        <span class="ms-glyph">${escapeHtml(m.glyph)}</span>
        <span class="ms-label">${escapeHtml(m.label)}</span>
        <span class="ms-status">${word}</span>
      </div>`;
    })
    .join("");
  return `
  <div class="milestones">
    <div class="ms-kicker muted small">Milestone ${escapeHtml(String(state.milestone || 1))} · ${completed}/${order.length} phases complete</div>
    ${renderCourse(state)}
    <div class="ms-list">${rows}</div>
  </div>`;
}

function renderActivity(decisions, learnings) {
  const dec = decisions ? `<div class="md">${mdToHtml(decisions)}</div>` : '<p class="muted">No decisions logged yet.</p>';
  const learn = learnings
    ? `<details class="artifact" style="margin-top:14px"><summary><span class="art-icon">✺</span><span class="art-label">Learnings</span></summary><div class="art-body md">${mdToHtml(learnings)}</div></details>`
    : "";
  return `<div class="activity">${dec}${learn}</div>`;
}

const RUNLOG_META = {
  init: { glyph: "⚑", cls: "ink", word: (e) => `Project initialized (${e.projectType || "?"})` },
  phase_advance: { glyph: "→", cls: "good", word: (e) => `Advanced ${e.from} → ${e.to}${e.forced ? " (forced)" : ""}` },
  gate_block: { glyph: "✕", cls: "bad", word: (e) => `Blocked at ${e.gate} gate (${e.phase})` },
  gate_override: { glyph: "!", cls: "warn", word: (e) => `Overrode ${e.gate} gate (${e.phase})` },
  verify: { glyph: "✓", cls: (e) => (e.passed ? "good" : "bad"), word: (e) => `Verify ${e.passed ? "passed" : "FAILED"} (${e.kind || "?"})` },
  tokens: { glyph: "$", cls: "brass", word: (e) => `Tokens: ${e.model || "?"} +${(e.tokensIn || 0) + (e.tokensOut || 0)} ($${Number(e.usd || 0).toFixed(4)})` },
  note: { glyph: "✎", cls: "ink", word: (e) => `Note: ${e.message || ""}` },
};

function renderTimeline(runlog) {
  if (!runlog || !Array.isArray(runlog.events) || runlog.events.length === 0) {
    return `<p class="muted">No run-log events yet — they're recorded as you init, advance, verify, track, and hit gates.</p>`;
  }
  const s = runlog.summary || {};
  const stat = (n, label, cls) => `<div class="rl-stat ${cls || ""}"><b>${escapeHtml(String(n))}</b><span>${escapeHtml(label)}</span></div>`;
  const stats = `
    <div class="rl-stats">
      ${stat(s.advances || 0, "advances")}
      ${stat(s.blocks || 0, "gate blocks", (s.blocks ? "bad" : ""))}
      ${stat(s.overrides || 0, "overrides", (s.overrides ? "warn" : ""))}
      ${stat(`${s.verifyPassed || 0}/${s.verifyRuns || 0}`, "verify pass")}
      ${stat("$" + Number(s.usd || 0).toFixed(2), "tracked spend", "brass")}
    </div>`;
  // Newest first, capped so the page stays light.
  const rows = runlog.events
    .slice()
    .reverse()
    .slice(0, 80)
    .map((e) => {
      const m = RUNLOG_META[e.type] || { glyph: "•", cls: "ink", word: () => e.type || "event" };
      const cls = typeof m.cls === "function" ? m.cls(e) : m.cls;
      const when = escapeHtml(String(e.ts || "").replace("T", " ").replace(/\..*$/, ""));
      return `
      <li class="rl-row">
        <span class="rl-glyph ${escapeHtml(cls)}" aria-hidden="true">${escapeHtml(m.glyph)}</span>
        <span class="rl-when mono">${when}</span>
        <span class="rl-text">${escapeHtml(m.word(e))}</span>
      </li>`;
    })
    .join("");
  return `${stats}<ul class="rl-list">${rows}</ul>`;
}

const NAV = [
  { id: "overview", label: "Overview", glyph: "◷" },
  { id: "board", label: "Board", glyph: "▦" },
  { id: "backlog", label: "Backlog", glyph: "≣" },
  { id: "issues", label: "Issues", glyph: "◬" },
  { id: "milestones", label: "Milestones", glyph: "◉" },
  { id: "timeline", label: "Run log", glyph: "⧗" },
  { id: "artifacts", label: "Artifacts", glyph: "❡" },
  { id: "activity", label: "Activity", glyph: "➜" },
];

export function renderDashboard({ state = {}, score = {}, security = {}, artifacts = {}, projectName = "", generatedAt = "", telemetry = null, goals = null, verify = null, issues = { open: [], solved: [] }, decisions = "", learnings = "", runlog = null, live = false } = {}) {
  const order = orderFor(state);
  const phases = state.phases || {};
  const done = order.filter((p) => phases[p] === "complete").length;
  const pct = order.length ? Math.round((done / order.length) * 100) : 0;
  const type = state.projectType === "existing" ? "brownfield" : "greenfield";
  const name = projectName || "Untitled project";
  const board = buildBoard({ issues, goals, state });
  const grade = score.grade || "–";
  const gradeClass = grade === "A" || grade === "B" ? "good" : grade === "C" ? "warn" : "bad";
  const curLabel = (PHASE_META[state.currentPhase] || {}).label || state.currentPhase || "—";
  const openCount = (issues && issues.open ? issues.open.length : 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Helm · ${escapeHtml(name)}</title>
<style>
  :root{
    --paper:#f6f1e6; --paper-2:#efe7d6; --card:#fbf8f0;
    --ink:#16263b; --ink-2:#3c5169; --muted:#7c8597;
    --brass:#a8772e; --brass-2:#c79a4a; --line:rgba(22,38,59,.14);
    --good:#2f7d5b; --warn:#b07d27; --bad:#b23a3a;
    --shadow:0 1px 0 rgba(255,255,255,.7) inset, 0 18px 40px -28px rgba(22,38,59,.55);
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    font-family:'Fraunces','Hoefler Text','Iowan Old Style',Georgia,serif;
    color:var(--ink);
    background:
      radial-gradient(1200px 600px at 88% -8%, rgba(168,119,46,.10), transparent 60%),
      repeating-linear-gradient(0deg, rgba(22,38,59,.035) 0 1px, transparent 1px 40px),
      repeating-linear-gradient(90deg, rgba(22,38,59,.035) 0 1px, transparent 1px 40px),
      var(--paper);
    line-height:1.5; -webkit-font-smoothing:antialiased;
  }
  .mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
  .muted{color:var(--muted)} .small{font-size:.82rem}
  .wrap{max-width:1060px;margin:0 auto;padding:34px 24px 64px}

  /* Topbar */
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1.5px solid var(--ink)}
  .brand{display:flex;align-items:center;gap:14px}
  .wheel{width:40px;height:40px;color:var(--brass)}
  .brand h1{font-size:1.55rem;letter-spacing:.34em;margin:0;font-weight:900;text-transform:uppercase}
  .brand .tag{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.28em;color:var(--ink-2);text-transform:uppercase}
  .meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
  .chip{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;
    border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 12px;color:var(--ink-2)}
  .chip.name{color:var(--ink);font-weight:500;border-color:var(--ink)}

  /* Course (phase journey) */
  .hero{margin:30px 0 10px}
  .hero .kicker{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.26em;text-transform:uppercase;color:var(--brass)}
  .hero .progress{display:flex;align-items:baseline;gap:14px;margin:4px 0 22px}
  .hero .progress b{font-size:2.6rem;font-weight:900;line-height:1}
  .course{list-style:none;display:flex;gap:0;margin:0;padding:0;overflow-x:auto}
  .stop{position:relative;flex:1;min-width:120px;text-align:center;padding:34px 8px 6px}
  .stop::before{content:"";position:absolute;top:18px;left:50%;right:-50%;height:0;border-top:2px dashed var(--line)}
  .stop:last-child::before{display:none}
  .stop-dot{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;
    display:grid;place-items:center;font-size:.95rem;background:var(--card);border:2px solid var(--line);color:var(--muted);z-index:1}
  .stop.done .stop-dot{background:var(--brass);border-color:var(--brass);color:#fff;box-shadow:0 6px 16px -8px rgba(168,119,46,.8)}
  .stop.current .stop-dot{border-color:var(--ink);color:var(--ink);box-shadow:0 0 0 5px rgba(22,38,59,.08)}
  .stop-label{display:block;font-weight:600;font-size:1rem;margin-top:4px}
  .stop.todo .stop-label{color:var(--muted)}
  .stop-note{display:block;font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);margin-top:2px}

  /* Panels grid */
  .grid{display:grid;grid-template-columns:1.35fr .9fr;gap:20px;margin-top:26px;align-items:start}
  @media(max-width:820px){.grid{grid-template-columns:1fr}}
  .grid .col{display:flex;flex-direction:column;gap:20px;min-width:0}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;box-shadow:var(--shadow)}
  .panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px;
    border-bottom:1px solid var(--line);padding-bottom:10px}
  .panel-head h2{font-size:1.08rem;margin:0;letter-spacing:.01em}

  /* Scorecard */
  .score-body{display:flex;gap:22px;align-items:flex-start}
  @media(max-width:520px){.score-body{flex-direction:column;align-items:stretch}}
  .medallion{flex:0 0 auto;width:118px;height:118px;border-radius:50%;display:grid;place-content:center;text-align:center;
    border:2px solid var(--brass);background:radial-gradient(circle at 50% 35%, #fff, var(--paper-2));box-shadow:var(--shadow)}
  .medallion.warn{border-color:var(--warn)} .medallion.bad{border-color:var(--bad)}
  .medallion .grade{font-size:3rem;font-weight:900;line-height:.9}
  .medallion.good .grade{color:var(--brass)} .medallion.warn .grade{color:var(--warn)} .medallion.bad .grade{color:var(--bad)}
  .grade-total{font-family:'IBM Plex Mono',monospace;font-size:.82rem;color:var(--ink-2)} .grade-total i{color:var(--muted);font-style:normal}
  .dims{flex:1;display:flex;flex-direction:column;gap:13px;min-width:0}
  .dim-head{display:flex;justify-content:space-between;font-size:.92rem;font-weight:600}
  .dim-num{font-family:'IBM Plex Mono',monospace} .dim-num i{color:var(--muted);font-style:normal;font-weight:400}
  .bar{height:8px;border-radius:6px;background:var(--paper-2);overflow:hidden;margin:5px 0 3px;border:1px solid var(--line)}
  .fill{display:block;height:100%;border-radius:6px}
  .fill.good{background:linear-gradient(90deg,var(--good),#3a9a70)} .fill.warn{background:linear-gradient(90deg,var(--warn),var(--brass-2))} .fill.bad{background:linear-gradient(90deg,var(--bad),#cf6a5a)}
  .dim-detail{font-size:.78rem;color:var(--muted)}
  .pending{margin-top:18px;border:1px dashed var(--line);border-radius:10px;padding:12px 14px;background:repeating-linear-gradient(135deg,rgba(168,119,46,.04) 0 8px,transparent 8px 16px)}
  .pending h3{margin:0 0 8px;font-size:.92rem}
  .pending ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
  .pending li{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:baseline;font-size:.86rem}
  .pend-mark{color:var(--brass)} .pend-why{color:var(--muted);font-size:.8rem}

  /* Security */
  .sec-status{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .sec-chip{font-family:'IBM Plex Mono',monospace;font-size:.82rem;font-weight:500;padding:6px 12px;border-radius:999px;border:1px solid}
  .sec-chip.good{color:var(--good);border-color:var(--good);background:rgba(47,125,91,.08)}
  .sec-chip.bad{color:var(--bad);border-color:var(--bad);background:rgba(178,58,58,.08)}

  /* Artifacts */
  .artifacts{display:flex;flex-direction:column;gap:10px}
  .artifact{border:1px solid var(--line);border-radius:11px;background:var(--paper);overflow:hidden}
  .artifact[open]{box-shadow:var(--shadow)}
  .artifact summary{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;list-style:none;user-select:none}
  .artifact summary::-webkit-details-marker{display:none}
  .art-icon{color:var(--brass);font-size:1.05rem;width:1.3em;text-align:center}
  .art-label{font-weight:600} .art-file{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--muted)}
  .art-tag{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2);border:1px solid var(--line);border-radius:6px;padding:2px 7px}
  .art-body{padding:6px 20px 18px;border-top:1px solid var(--line);background:var(--card)}

  /* Rendered markdown */
  .md h1,.md h2,.md h3{font-weight:600;line-height:1.2;margin:16px 0 8px}
  .md h1{font-size:1.25rem} .md h2{font-size:1.08rem} .md h3{font-size:.96rem}
  .md p{margin:8px 0} .md ul.md-list{margin:8px 0;padding-left:20px} .md li{margin:3px 0}
  .md li.task{list-style:none;margin-left:-20px;display:flex;gap:8px;align-items:baseline}
  .md code{font-family:'IBM Plex Mono',monospace;font-size:.85em;background:var(--paper-2);padding:1px 5px;border-radius:5px}
  .md blockquote{margin:8px 0;padding:4px 14px;border-left:3px solid var(--brass);color:var(--ink-2);background:rgba(168,119,46,.06)}
  .md hr{border:none;border-top:1px solid var(--line);margin:14px 0}
  .md .md-table{border-collapse:collapse;width:100%;margin:10px 0;font-size:.86rem}
  .md .md-table th,.md .md-table td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
  .md .md-table thead th{background:var(--paper-2);font-weight:600;font-family:'IBM Plex Mono',monospace;font-size:.74rem;letter-spacing:.04em;text-transform:uppercase}
  .md .checkbox{accent-color:var(--brass)}

  /* Tokens & credits */
  .tokens-top{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start;margin-bottom:6px}
  .tok-figure{display:flex;flex-direction:column;gap:2px}
  .tok-big{font-size:2.1rem;font-weight:900;line-height:1;color:var(--ink)}
  .tok-usd{color:var(--brass)}
  .tok-cap{text-transform:uppercase;letter-spacing:.08em}
  .tok-sub{margin:4px 0 2px}
  .usage-block{margin-top:14px}
  .usage-head{margin:0 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-2);font-family:'IBM Plex Mono',monospace;font-weight:600}
  .usage-row{display:grid;grid-template-columns:7.5em 1fr auto;gap:10px;align-items:center;font-size:.84rem;margin:5px 0}
  .usage-name{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .usage-bar{height:7px;border-radius:6px;background:var(--paper-2);overflow:hidden;border:1px solid var(--line)}
  .usage-fill{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--brass),var(--brass-2))}
  .usage-val{color:var(--ink-2);font-size:.82rem}
  .usage-list{list-style:none;margin:0;padding:0}
  .usage-list li{display:flex;justify-content:space-between;gap:10px;font-size:.84rem;margin:4px 0}

  /* Goals */
  .goals-bar{margin:2px 0 14px}
  .goals-list{margin:0;padding-left:0}
  .goals-list li.task{list-style:none;display:flex;gap:8px;align-items:baseline;margin:5px 0}
  .goals-list li.task.done span{color:var(--muted);text-decoration:line-through}
  .goals-list .checkbox{accent-color:var(--brass)}

  /* Verify */
  .verify-status{margin-bottom:10px}
  .verify-chip{font-family:'IBM Plex Mono',monospace;font-size:.82rem;font-weight:500;padding:6px 12px;border-radius:999px;border:1px solid}
  .verify-chip.good{color:var(--good);border-color:var(--good);background:rgba(47,125,91,.08)}
  .verify-chip.bad{color:var(--bad);border-color:var(--bad);background:rgba(178,58,58,.08)}
  .verify-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
  .verify-row{display:grid;grid-template-columns:auto auto 1fr;gap:9px;align-items:baseline;font-size:.86rem}
  .verify-mark{font-family:'IBM Plex Mono',monospace;font-weight:700}
  .verify-mark.good{color:var(--good)} .verify-mark.bad{color:var(--bad)}
  .verify-name{font-weight:600}
  .verify-detail{font-size:.8rem}

  /* Live indicator */
  .live-dot{display:inline-flex;align-items:center;gap:7px;color:var(--good)}
  .live-dot::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--good);box-shadow:0 0 0 0 rgba(47,125,91,.5);animation:livePulse 2s infinite}
  @keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(47,125,91,.5)}70%{box-shadow:0 0 0 7px rgba(47,125,91,0)}100%{box-shadow:0 0 0 0 rgba(47,125,91,0)}}

  footer{margin-top:30px;text-align:center;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.1em}

  /* ---- Jira-style app shell ---- */
  .app{display:grid;grid-template-columns:236px 1fr;min-height:100vh}
  @media(max-width:780px){.app{grid-template-columns:1fr}}
  .side{background:linear-gradient(180deg,var(--card),var(--paper-2));border-right:1.5px solid var(--ink);padding:22px 16px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh;overflow:auto}
  @media(max-width:780px){.side{position:static;height:auto;border-right:none;border-bottom:1.5px solid var(--ink)}}
  .side .brand{gap:11px}
  .side .wheel{width:32px;height:32px}
  .side .brand h1{font-size:1.15rem;letter-spacing:.3em}
  .side .brand .tag{font-size:.58rem;letter-spacing:.24em}
  .nav{display:flex;flex-direction:column;gap:3px}
  .nav button{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:none;border:none;border-radius:9px;
    padding:9px 12px;font:inherit;font-size:.95rem;color:var(--ink-2);cursor:pointer}
  .nav button:hover{background:rgba(168,119,46,.10);color:var(--ink)}
  .nav button.active{background:var(--brass);color:#fff;font-weight:600;box-shadow:0 6px 16px -10px rgba(168,119,46,.9)}
  .nav .nav-glyph{width:1.2em;text-align:center;opacity:.9}
  .nav .nav-badge{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:.66rem;background:rgba(178,58,58,.14);color:var(--bad);border-radius:999px;padding:1px 7px}
  .nav button.active .nav-badge{background:rgba(255,255,255,.25);color:#fff}
  .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;font-size:.78rem;color:var(--ink-2)}
  .side-foot .kv{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:8px}
  .mini-grade{font-family:'IBM Plex Mono',monospace;font-weight:700}
  .mini-grade.good{color:var(--brass)} .mini-grade.warn{color:var(--warn)} .mini-grade.bad{color:var(--bad)}

  .main{padding:30px 34px 64px;min-width:0;max-width:1180px}
  @media(max-width:780px){.main{padding:22px 18px 48px}}
  .view{display:none;animation:fade .25s ease}
  .view.active{display:block}
  @keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .view-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin:0 0 20px;border-bottom:1.5px solid var(--ink);padding-bottom:12px}
  .view-head h2{margin:0;font-size:1.5rem;font-weight:900;letter-spacing:.01em}
  .view-head .crumb{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--brass)}

  /* Board */
  .board{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
  @media(max-width:780px){.board{grid-template-columns:1fr}}
  .bcol{background:var(--paper-2);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:120px}
  .bcol-head{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);margin:2px 4px 12px}
  .bcol-head .count{margin-left:auto;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
  .bcol-body{display:flex;flex-direction:column;gap:9px}
  .card{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:9px;padding:11px 13px;box-shadow:0 8px 18px -16px rgba(22,38,59,.6)}
  .card-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .card-id{font-size:.68rem;color:var(--muted)}
  .card-title{font-weight:600;font-size:.94rem;line-height:1.3}
  .card-note{margin-top:5px}
  .empty{padding:10px 4px;text-align:center}
  .list{display:flex;flex-direction:column;gap:10px;max-width:760px}

  /* Badges */
  .badge{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;border-radius:6px;padding:2px 8px;border:1px solid}
  .badge.bad{color:var(--bad);border-color:var(--bad);background:rgba(178,58,58,.08)}
  .badge.good{color:var(--good);border-color:var(--good);background:rgba(47,125,91,.08)}
  .badge.brass{color:var(--brass);border-color:var(--brass);background:rgba(168,119,46,.08)}
  .badge.ink{color:var(--ink-2);border-color:var(--line);background:var(--paper-2)}
  .badge.muted{color:var(--muted);border-color:var(--line);background:var(--paper-2)}

  /* Issues */
  .issues .sub{font-size:.95rem;margin:0 0 10px;display:flex;align-items:center;gap:8px}
  .issues .sub.spaced{margin-top:22px}
  .issues .count{font-family:'IBM Plex Mono',monospace;font-size:.7rem;background:var(--paper-2);border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--ink-2)}
  .issue-row{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:9px 13px;margin-bottom:8px}
  .issue-row .badge{margin-left:0}
  .issue-title{font-weight:600;font-size:.92rem}
  .issue-meta{margin-left:auto;text-align:right;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .issue-row.solved .issue-title{color:var(--ink-2)}

  /* Milestones */
  .ms-kicker{margin-bottom:14px}
  .ms-list{margin-top:18px;display:flex;flex-direction:column;gap:8px;max-width:620px}
  .ms-row{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:11px 14px}
  .ms-row .ms-glyph{color:var(--muted);width:1.3em;text-align:center}
  .ms-row.done{border-left:3px solid var(--brass)} .ms-row.done .ms-glyph{color:var(--brass)}
  .ms-row.current{border-left:3px solid var(--ink);box-shadow:0 0 0 3px rgba(22,38,59,.05)} .ms-row.current .ms-glyph{color:var(--ink)}
  .ms-label{font-weight:600} .ms-row.todo .ms-label{color:var(--muted)}
  .ms-status{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}

  .sub{font-weight:600}

  /* Run log / timeline */
  .rl-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .rl-stat{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:11px 16px;min-width:96px;display:flex;flex-direction:column;gap:2px}
  .rl-stat b{font-size:1.5rem;font-weight:900;line-height:1}
  .rl-stat span{font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .rl-stat.bad b{color:var(--bad)} .rl-stat.warn b{color:var(--warn)} .rl-stat.brass b{color:var(--brass)}
  .rl-list{list-style:none;margin:0;padding:0;border-left:2px solid var(--line);margin-left:8px}
  .rl-row{display:flex;align-items:baseline;gap:12px;padding:7px 0 7px 18px;position:relative;font-size:.9rem}
  .rl-glyph{position:absolute;left:-11px;top:8px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;background:var(--card);border:1px solid var(--line);color:var(--muted)}
  .rl-glyph.good{color:var(--good);border-color:var(--good)} .rl-glyph.bad{color:var(--bad);border-color:var(--bad)}
  .rl-glyph.warn{color:var(--warn);border-color:var(--warn)} .rl-glyph.brass{color:var(--brass);border-color:var(--brass)} .rl-glyph.ink{color:var(--ink-2)}
  .rl-when{color:var(--muted);font-size:.74rem;flex:0 0 auto;min-width:8.5em}
  .rl-text{color:var(--ink)}
</style>
</head>
<body>
  <div class="app">
    <aside class="side">
      <div class="brand">
        <svg class="wheel" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4">
          <circle cx="50" cy="50" r="20"/><circle cx="50" cy="50" r="7" fill="currentColor" stroke="none"/>
          <g stroke-linecap="round">
            <line x1="50" y1="30" x2="50" y2="6"/><line x1="50" y1="70" x2="50" y2="94"/>
            <line x1="30" y1="50" x2="6" y2="50"/><line x1="70" y1="50" x2="94" y2="50"/>
            <line x1="35" y1="35" x2="18" y2="18"/><line x1="65" y1="65" x2="82" y2="82"/>
            <line x1="65" y1="35" x2="82" y2="18"/><line x1="35" y1="65" x2="18" y2="82"/>
          </g>
        </svg>
        <div><h1>Helm</h1><div class="tag">${live ? "live console" : "project console"}</div></div>
      </div>
      <nav class="nav">
        ${NAV.map((n) => `<button class="${n.id === "overview" ? "active" : ""}" data-view="${escapeHtml(n.id)}"><span class="nav-glyph" aria-hidden="true">${escapeHtml(n.glyph)}</span>${escapeHtml(n.label)}${n.id === "issues" && openCount ? `<span class="nav-badge">${openCount}</span>` : ""}</button>`).join("")}
      </nav>
      <div class="side-foot">
        ${live ? '<div class="live-dot">live · auto-refresh</div>' : ""}
        <div class="kv"><span>Project</span><strong>${escapeHtml(name)}</strong></div>
        <div class="kv"><span>Phase</span><strong>${escapeHtml(curLabel)}</strong></div>
        <div class="kv"><span>Health</span><strong class="mini-grade ${gradeClass}">${escapeHtml(grade)} · ${score.total ?? 0}/100</strong></div>
        <div class="kv"><span>Milestone</span><strong>${escapeHtml(String(state.milestone || 1))} · ${escapeHtml(type)}</strong></div>
      </div>
    </aside>

    <main class="main">
      <section class="view active" id="overview">
        <div class="view-head"><h2>Overview</h2><span class="crumb">current state · ${pct}% charted</span></div>
        <section class="hero">
          <div class="progress"><b>${pct}%</b><span class="muted">of the journey charted · now on <strong>${escapeHtml(curLabel)}</strong></span></div>
        </section>
        <div class="grid">
          <div class="col">${renderScore(score)}</div>
          <div class="col">
            ${renderSecurity(security)}
            ${renderVerify(verify)}
            ${renderTelemetry(telemetry)}
            ${renderGoals(goals)}
          </div>
        </div>
      </section>

      <section class="view" id="board">
        <div class="view-head"><h2>Board</h2><span class="crumb">kanban · issues + goals</span></div>
        ${renderBoard(board)}
      </section>

      <section class="view" id="backlog">
        <div class="view-head"><h2>Backlog</h2><span class="crumb">${board.backlog.length} item(s) waiting</span></div>
        ${renderBacklog(board)}
      </section>

      <section class="view" id="issues">
        <div class="view-head"><h2>Issues</h2><span class="crumb">open + solved</span></div>
        ${renderIssues(issues)}
      </section>

      <section class="view" id="milestones">
        <div class="view-head"><h2>Milestones</h2><span class="crumb">the journey</span></div>
        ${renderMilestones(state)}
      </section>

      <section class="view" id="timeline">
        <div class="view-head"><h2>Run log</h2><span class="crumb">what Helm actually did${runlog && runlog.summary ? ` · ${runlog.summary.total} event(s)` : ""}</span></div>
        ${renderTimeline(runlog)}
      </section>

      <section class="view" id="artifacts">
        <div class="view-head"><h2>Artifacts</h2><span class="crumb">PRD, design, ship &amp; more</span></div>
        ${renderArtifacts(artifacts, state)}
      </section>

      <section class="view" id="activity">
        <div class="view-head"><h2>Activity</h2><span class="crumb">decisions &amp; learnings</span></div>
        ${renderActivity(decisions, learnings)}
      </section>

      <footer>Generated by Helm · read-only snapshot${generatedAt ? " · " + escapeHtml(generatedAt) : ""}</footer>
    </main>
  </div>
  <script>
    (function(){
      var nav = document.querySelectorAll('.nav button');
      function show(id){
        if(!document.getElementById(id)) id='overview';
        nav.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view')===id); });
        document.querySelectorAll('.view').forEach(function(v){ v.classList.toggle('active', v.id===id); });
        return id;
      }
      function current(){ var a=document.querySelector('.nav button.active'); return a?a.getAttribute('data-view'):'overview'; }
      nav.forEach(function(btn){
        btn.addEventListener('click', function(){
          var id=show(btn.getAttribute('data-view'));
          try{ history.replaceState(null,'','#'+id); }catch(e){}
        });
      });
      // Restore the active view from the URL hash so returning/refreshing keeps your place.
      var h=(location.hash||'').replace('#',''); if(h) show(h);

      var LIVE = ${live ? "true" : "false"};
      if (LIVE) {
        // Live mode polls and swaps only the content + sidebar status — no full-page
        // reload — so your current view (Board, Issues, …) is preserved.
        setInterval(function(){
          fetch(location.pathname, {cache:'no-store'}).then(function(r){return r.text();}).then(function(t){
            var doc = new DOMParser().parseFromString(t, 'text/html');
            var keep = current();
            var main = doc.querySelector('.main'), foot = doc.querySelector('.side-foot');
            if (main) document.querySelector('.main').innerHTML = main.innerHTML;
            if (foot) document.querySelector('.side-foot').innerHTML = foot.innerHTML;
            show(keep);
          }).catch(function(){});
        }, 5000);
      }
    })();
  </script>
</body>
</html>`;
}
