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
