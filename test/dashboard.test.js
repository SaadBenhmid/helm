import { test } from "node:test";
import assert from "node:assert/strict";
import { mdToHtml, renderDashboard } from "../src/dashboard.js";

test("mdToHtml renders headings, bold, inline code and escapes HTML", () => {
  const html = mdToHtml("# Title\n\nSome **bold** and `code` here.");
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test("mdToHtml escapes raw HTML to prevent injection", () => {
  const html = mdToHtml("a <script>alert(1)</script> b");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("mdToHtml refuses javascript: and other dangerous link schemes", () => {
  const js = mdToHtml("[click](javascript:alert`1`)");
  assert.doesNotMatch(js, /href="javascript/i);
  assert.match(js, /click/); // rendered as plain text
  const data = mdToHtml("[x](data:text/html;base64,PHN2Zz4=)");
  assert.doesNotMatch(data, /href="data:/i);
});

test("mdToHtml allows safe http/relative links and cannot break out of the href attribute", () => {
  const ok = mdToHtml("[site](https://example.com/a?b=1&c=2)");
  assert.match(ok, /<a href="https:\/\/example\.com[^"]*" rel="noopener/);
  // A quote in the URL must be escaped, not close the attribute.
  const evil = mdToHtml('[x](https://a"onmouseover=alert(1))');
  assert.doesNotMatch(evil, /href="https:\/\/a"onmouseover/);
});

test("mdToHtml does not italicise * used between word characters", () => {
  const html = mdToHtml("area is 3*4*5 and glob src/*.js here");
  assert.doesNotMatch(html, /<em>/);
});

test("mdToHtml renders a table", () => {
  const html = mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
  assert.match(html, /<table/);
  assert.match(html, /<th>A<\/th>/);
  assert.match(html, /<td>1<\/td>/);
});

test("mdToHtml renders checkbox list items", () => {
  const html = mdToHtml("- [ ] todo\n- [x] done");
  assert.match(html, /todo/);
  assert.match(html, /done/);
  assert.match(html, /checkbox/i); // rendered as a checkbox affordance, not a literal [ ]
});

const state = {
  projectType: "new",
  currentPhase: "build",
  phaseStatus: "in_progress",
  milestone: 1,
  phases: { validate: "complete", prd: "complete", mockup: "complete", setup: "complete", build: "in_progress" },
};
const score = {
  total: 87,
  grade: "B",
  dimensions: [
    { name: "Journey progress", score: 13, max: 20, detail: "4/6 phases complete" },
    { name: "Security gate", score: 30, max: 30, detail: "no secrets detected" },
  ],
  pending: [{ name: "Deployed", why: "no deploy step yet" }],
};

function render() {
  return renderDashboard({
    state,
    score,
    security: { findings: [], suppressed: 0 },
    artifacts: { "PRD.md": "# PRD\n\n## Problem\nReal content." },
    projectName: "Acme",
  });
}

test("renderDashboard returns a complete, self-contained HTML document", () => {
  const html = render();
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<style>/); // inline CSS, no external stylesheet dependency
  assert.doesNotMatch(html, /<link[^>]+stylesheet[^>]*href=["']\.?\//); // no local css dep
});

test("dashboard shows project, grade, every phase, and artifacts", () => {
  const html = render();
  assert.match(html, /Acme/);
  assert.match(html, /\bB\b/); // the grade
  for (const p of ["validate", "prd", "mockup", "setup", "build"]) {
    assert.match(html.toLowerCase(), new RegExp(p));
  }
  assert.match(html, /PRD/);
  assert.match(html, /Problem/); // artifact content rendered
});

test("dashboard surfaces the honest pending panel", () => {
  const html = render();
  assert.match(html, /Deployed/);
  assert.match(html.toLowerCase(), /pending|not yet|unproven/);
});

test("dashboard is a LIGHT theme (no dark background)", () => {
  const html = render().toLowerCase();
  // body/background must not be black/near-black; must declare a light surface.
  assert.doesNotMatch(html, /background[^;]*#0[0-9a-f]{2}[0-9a-f]?\b/); // no near-black bg hex like #0xx
  assert.doesNotMatch(html, /background[^;]*:\s*(black|#000)\b/);
  assert.match(html, /background/); // a background is set (a light one)
});

test("dashboard escapes a malicious project name", () => {
  const html = renderDashboard({
    state,
    score,
    security: { findings: [], suppressed: 0 },
    artifacts: {},
    projectName: '<img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img/);
});

// ---- New panels: tokens & credits ----

test("tokens panel renders total tokens, USD, and a by-phase breakdown", () => {
  const html = renderDashboard({
    state,
    score,
    telemetry: {
      tokensIn: 12000,
      tokensOut: 3456,
      usd: 0.0123,
      count: 7,
      byPhase: { build: 9000, prd: 6456 },
      byModel: { "claude-opus": 15456 },
    },
  });
  assert.match(html, /Tokens/i);
  // total = 12000 + 3456 = 15456 -> grouped
  assert.match(html, /15,456/);
  assert.match(html, /\$0\.0123/); // formatted like $0.0123
  assert.match(html, /By phase/i);
  assert.match(html, /Build/); // phase label, not raw key only
  assert.match(html, /By model/i);
  assert.match(html, /claude-opus/);
});

test("tokens panel is absent when telemetry is null and does not crash", () => {
  const html = renderDashboard({ state, score, telemetry: null });
  assert.doesNotMatch(html, /Tokens &amp; credits/);
});

test("tokens panel escapes malicious model/phase names", () => {
  const html = renderDashboard({
    state,
    score,
    telemetry: {
      tokensIn: 1,
      tokensOut: 1,
      usd: 0,
      byPhase: { "<b>x</b>": 5 },
      byModel: { '<img src=x onerror=alert(1)>': 9 },
    },
  });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

// ---- New panels: goals ----

test("goals panel renders progress and the checklist with checkbox affordances", () => {
  const html = renderDashboard({
    state,
    score,
    goals: {
      total: 3,
      done: 1,
      items: [
        { text: "Ship MVP", done: true },
        { text: "Write docs", done: false },
        { text: "Launch", done: false },
      ],
    },
  });
  assert.match(html, /Goals/);
  assert.match(html, /1\/3/);
  assert.match(html, /Ship MVP/);
  assert.match(html, /Write docs/);
  assert.match(html, /checkbox/i);
});

test("goals panel derives done count from items when not given, and escapes text", () => {
  const html = renderDashboard({
    state,
    score,
    goals: { items: [{ text: "<script>alert(1)</script>", done: true }] },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("goals panel is absent when goals is null and does not crash", () => {
  const html = renderDashboard({ state, score, goals: null });
  assert.doesNotMatch(html, /<h2>Goals<\/h2>/);
});

// ---- New panels: verify ----

test("verify panel shows a pass chip and each check row", () => {
  const html = renderDashboard({
    state,
    score,
    verify: {
      passed: true,
      ranAt: "2026-05-30T10:00:00Z",
      checks: [
        { name: "unit tests", ok: true, detail: "142 passed" },
        { name: "lint", ok: true, detail: "clean" },
      ],
    },
  });
  assert.match(html, /Verify/);
  assert.match(html, /passed/i);
  assert.match(html, /unit tests/);
  assert.match(html, /142 passed/);
});

test("verify panel shows a fail chip when a check fails", () => {
  const html = renderDashboard({
    state,
    score,
    verify: {
      passed: false,
      ranAt: "now",
      checks: [{ name: "build", ok: false, detail: "compile error" }],
    },
  });
  assert.match(html, /failed/i);
  assert.match(html, /compile error/);
});

test("verify panel shows a muted 'not run yet' message when verify is null", () => {
  const html = renderDashboard({ state, score, verify: null });
  assert.match(html, /Verify/);
  assert.match(html, /not run yet/i);
  assert.match(html, /helm verify/);
});

test("verify panel escapes malicious check values", () => {
  const html = renderDashboard({
    state,
    score,
    verify: {
      passed: false,
      checks: [{ name: "<img src=x onerror=alert(1)>", ok: false, detail: "<b>boom</b>" }],
    },
  });
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<b>boom<\/b>/);
  assert.match(html, /&lt;img/);
});

// ---- Live mode ----

test("live mode polls in the background (no full-page reload) and shows a live indicator", () => {
  const html = renderDashboard({ state, score, live: true });
  // No meta-refresh — that reloads the page and would reset the active tab.
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.match(html, /var LIVE = true/);
  assert.match(html, /setInterval/);
  assert.match(html, /live/i);
});

test("non-live mode does not poll", () => {
  const html = renderDashboard({ state, score, live: false });
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.match(html, /var LIVE = false/);
});

test("the active view is restored from the URL hash (survives refresh/return)", () => {
  const html = renderDashboard({ state, score, live: true });
  assert.match(html, /location\.hash/);
});

test("all new panels together render without crashing and stay light theme", () => {
  const html = renderDashboard({
    state,
    score,
    security: { findings: [], suppressed: 0 },
    artifacts: { "PRD.md": "# PRD" },
    projectName: "Acme",
    telemetry: { tokensIn: 10, tokensOut: 5, usd: 0.5, count: 1, byPhase: { build: 15 }, byModel: {} },
    goals: { total: 1, done: 0, items: [{ text: "x", done: false }] },
    verify: { passed: true, ranAt: "now", checks: [{ name: "t", ok: true, detail: "" }] },
    live: true,
  });
  assert.match(html, /<!DOCTYPE html>/i);
  assert.doesNotMatch(html.toLowerCase(), /background[^;]*:\s*(black|#000)\b/);
});

test("degrades gracefully when called with no arguments at all", () => {
  assert.doesNotThrow(() => renderDashboard());
  const html = renderDashboard();
  assert.match(html, /<!DOCTYPE html>/i);
});
