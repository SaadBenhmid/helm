import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDashboard } from "../src/dashboard.js";

const state = {
  projectType: "new",
  currentPhase: "build",
  phaseStatus: "in_progress",
  milestone: 2,
  phases: { validate: "complete", prd: "complete", mockup: "complete", setup: "complete", build: "in_progress" },
};
const score = { total: 72, grade: "C", dimensions: [{ name: "Security gate", score: 30, max: 30, detail: "clean" }], pending: [{ name: "Deployed", why: "no deploy step" }] };
const issues = {
  open: [{ id: "I-3", title: "Referral race", type: "bug", notes: "debounce" }],
  solved: [{ id: "I-1", title: "Login loop", fix: "guard redirect", date: "2026-05-29" }],
};

function render(extra = {}) {
  return renderDashboard({
    state,
    score,
    security: { findings: [], suppressed: 0 },
    artifacts: { "PRD.md": "# PRD\n\n## Problem\nReal." },
    projectName: "Acme",
    goals: { total: 2, done: 1, items: [{ text: "Ship waitlist", done: true }, { text: "Live referrals", done: false }] },
    issues,
    decisions: "# Decisions Log\n\n| Date | Decision | Why | Phase |\n|--|--|--|--|\n| 2026-05-30 | Magic link | fewer secrets | prd |\n",
    learnings: "# Learnings\n\nKeep gates loud.",
    ...extra,
  });
}

test("dashboard has a sidebar nav with all Jira-style views", () => {
  const html = render();
  for (const label of ["Overview", "Board", "Backlog", "Issues", "Milestones", "Artifacts", "Activity"]) {
    assert.match(html, new RegExp(`data-view="${label.toLowerCase()}"`), `missing nav for ${label}`);
  }
  // exactly one default-active view + tab-switching script present
  assert.match(html, /class="view active" id="overview"/);
  assert.match(html, /\.nav button/); // the switcher script
});

test("board view renders Backlog / In progress / Done columns with cards", () => {
  const html = render();
  assert.match(html, /id="board"/);
  assert.match(html, /Backlog/);
  assert.match(html, /In progress/);
  assert.match(html, />Done</);
  // the open issue shows as a card with its id + bug badge
  assert.match(html, /I-3/);
  assert.match(html, /Referral race/);
  assert.match(html, /badge bad/); // bug → red badge
});

test("issues view lists open and solved issues", () => {
  const html = render();
  assert.match(html, /id="issues"/);
  assert.match(html, /Login loop/);
  assert.match(html, /guard redirect/);
});

test("milestones view lists every phase with a status word", () => {
  const html = render();
  assert.match(html, /id="milestones"/);
  for (const p of ["Validate", "PRD", "Mockup", "Setup", "Build"]) assert.match(html, new RegExp(p));
  assert.match(html, /in progress/); // current phase status word
});

test("the issues nav shows an open-issue count badge", () => {
  const html = render();
  assert.match(html, /nav-badge">1</);
});

test("malicious issue title is escaped in the board", () => {
  const html = render({ issues: { open: [{ id: "X", title: "<img src=x onerror=alert(1)>", type: "bug", notes: "" }], solved: [] } });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img/);
});

test("run-log timeline view renders events + summary stats, and escapes notes", () => {
  const runlog = {
    events: [
      { type: "init", projectType: "new", ts: "2026-05-30T10:00:00Z" },
      { type: "phase_advance", from: "validate", to: "prd", ts: "2026-05-30T10:01:00Z" },
      { type: "gate_block", gate: "artifact", phase: "prd", ts: "2026-05-30T10:02:00Z" },
      { type: "note", message: "<script>alert(1)</script>", ts: "2026-05-30T10:03:00Z" },
    ],
    summary: { total: 4, advances: 1, blocks: 1, overrides: 0, verifyRuns: 0, verifyPassed: 0, usd: 0, first: "a", last: "b" },
  };
  const html = render({ runlog });
  assert.match(html, /data-view="timeline"/);
  assert.match(html, /id="timeline"/);
  assert.match(html, /Advanced validate/);
  assert.match(html, /Blocked at artifact gate/);
  assert.match(html, /rl-stats/); // summary stat blocks
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("timeline view degrades gracefully with no run log", () => {
  const html = render({ runlog: null });
  assert.match(html, /id="timeline"/);
  assert.match(html, /No run-log events yet/);
});

test("stays a light theme (no dark background)", () => {
  const html = render().toLowerCase();
  assert.doesNotMatch(html, /background[^;]*:\s*(black|#000)\b/);
});
