import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProject, gradeFor } from "../src/score.js";

const fullState = {
  projectType: "new",
  currentPhase: "ship",
  phaseStatus: "in_progress",
  milestone: 1,
  phases: { validate: "complete", prd: "complete", mockup: "complete", setup: "complete", build: "complete", ship: "in_progress" },
};

const realArtifacts = {
  "VALIDATION.md":
    "# Validation\n\nMarket is large and growing; acquisition cost is low and the wedge is clear. " +
    "Competitors validate demand but leave the security gap open. Recommendation: GO. " +
    "This is several sentences of genuine analysis, comfortably past the stub threshold so it counts as a real artifact.",
  "PRD.md":
    "# PRD\n\n## Problem\nNon-technical founders cannot ship safely.\n\n## Scope\nDeliver A, B, C. Non-goals: D, E. " +
    "Acceptance criteria are machine-verifiable and the tech stack is ranked by expected users and budget. " +
    "Real content, well beyond the placeholder threshold, so the artifact dimension recognises it as written.",
};

function baseInput(over = {}) {
  return {
    state: fullState,
    present: ["state.json", "DECISIONS.md", "ISSUES.md", "LEARNINGS.md", "handoff.md"],
    lint: [],
    security: [],
    artifacts: realArtifacts,
    decisions: "| Date | Decision | Why | Phase |\n|--|--|--|--|\n| 2026-05-30 | Picked X | because Y | prd |\n",
    issues: "## Open\n| ID | Title |\n|--|--|\n| I-1 | something |\n",
    ...over,
  };
}

test("gradeFor maps totals to letters", () => {
  assert.equal(gradeFor(95), "A");
  assert.equal(gradeFor(82), "B");
  assert.equal(gradeFor(71), "C");
  assert.equal(gradeFor(64), "D");
  assert.equal(gradeFor(40), "F");
});

test("a healthy project scores high with no failing dimensions", () => {
  const s = scoreProject(baseInput());
  assert.ok(s.total >= 80, `expected >=80, got ${s.total}`);
  assert.ok(["A", "B"].includes(s.grade));
  assert.ok(Array.isArray(s.dimensions) && s.dimensions.length >= 4);
  for (const d of s.dimensions) {
    assert.ok(typeof d.score === "number" && d.score <= d.max);
  }
});

test("security blockers crater the security dimension", () => {
  const clean = scoreProject(baseInput());
  const leaky = scoreProject(baseInput({ security: [{ level: "block", rule: "aws-access-key" }] }));
  const cs = clean.dimensions.find((d) => /security/i.test(d.name)).score;
  const ls = leaky.dimensions.find((d) => /security/i.test(d.name)).score;
  assert.ok(ls < cs, "blockers must reduce the security score");
  assert.ok(leaky.total < clean.total);
});

test("lint errors reduce the memory dimension", () => {
  const bad = scoreProject(baseInput({ lint: [{ level: "error", msg: "state.json missing" }] }));
  const mem = bad.dimensions.find((d) => /memory/i.test(d.name));
  assert.ok(mem.score < mem.max);
});

test("partial progress scores lower than full", () => {
  const early = scoreProject(
    baseInput({
      state: { ...fullState, currentPhase: "prd", phases: { validate: "complete", prd: "in_progress" } },
    })
  );
  const full = scoreProject(baseInput());
  const ep = early.dimensions.find((d) => /progress/i.test(d.name)).score;
  const fp = full.dimensions.find((d) => /progress/i.test(d.name)).score;
  assert.ok(ep < fp);
});

test("stub artifacts (placeholders) do not count as real", () => {
  const stubbed = scoreProject(baseInput({ artifacts: { "PRD.md": "# Ship Checklist — <Product Name>\n- [ ] todo" } }));
  const real = scoreProject(baseInput());
  const ss = stubbed.dimensions.find((d) => /artifact/i.test(d.name)).score;
  const rs = real.dimensions.find((d) => /artifact/i.test(d.name)).score;
  assert.ok(ss < rs, "a placeholder artifact must score lower than a real one");
});

test("empty decision/issue logs reduce the trail dimension", () => {
  const noTrail = scoreProject(baseInput({ decisions: "| Date | Decision | Why | Phase |\n|--|--|--|--|\n", issues: "## Open\n| ID | Title |\n|--|--|\n" }));
  const trail = noTrail.dimensions.find((d) => /trail|decision/i.test(d.name));
  assert.ok(trail.score < trail.max);
});

test("pending outcome dimensions are reported honestly and excluded from the score", () => {
  const s = scoreProject(baseInput());
  assert.ok(Array.isArray(s.pending) && s.pending.length >= 2, "should list unproven outcome metrics");
  assert.ok(s.pending.some((p) => /deploy/i.test(p.name)));
  // Pending items must not inflate the numeric score (max is 100 from measurable dims).
  assert.ok(s.total <= 100);
});
