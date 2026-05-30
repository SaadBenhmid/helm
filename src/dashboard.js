import { orderFor } from "./state.js";

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
        <span class="stop-dot" aria-hidden="true">${m.glyph}</span>
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

export function renderDashboard({ state = {}, score = {}, security = {}, artifacts = {}, projectName = "", generatedAt = "" } = {}) {
  const order = orderFor(state);
  const phases = state.phases || {};
  const done = order.filter((p) => phases[p] === "complete").length;
  const pct = order.length ? Math.round((done / order.length) * 100) : 0;
  const type = state.projectType === "existing" ? "brownfield" : "greenfield";
  const name = projectName || "Untitled project";

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
  .grid{display:grid;grid-template-columns:1.35fr .9fr;gap:20px;margin-top:26px}
  @media(max-width:820px){.grid{grid-template-columns:1fr}}
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

  footer{margin-top:30px;text-align:center;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.1em}
</style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
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
        <div><h1>Helm</h1><div class="tag">project console</div></div>
      </div>
      <div class="meta">
        <span class="chip name">${escapeHtml(name)}</span>
        <span class="chip">${escapeHtml(type)}</span>
        <span class="chip">milestone ${escapeHtml(String(state.milestone || 1))}</span>
      </div>
    </header>

    <section class="hero">
      <div class="kicker">Charted course</div>
      <div class="progress"><b>${pct}%</b><span class="muted">of the journey charted · now on <strong>${escapeHtml((PHASE_META[state.currentPhase] || {}).label || state.currentPhase || "—")}</strong></span></div>
      ${renderCourse(state)}
    </section>

    <div class="grid">
      <div class="col">${renderScore(score)}</div>
      <div class="col">${renderSecurity(security)}</div>
    </div>

    ${renderArtifacts(artifacts, state)}

    <footer>Generated by Helm · read-only snapshot${generatedAt ? " · " + escapeHtml(generatedAt) : ""}</footer>
  </div>
</body>
</html>`;
}
