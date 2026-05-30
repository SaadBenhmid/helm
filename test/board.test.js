import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIssues, buildBoard } from "../src/board.js";

const ISSUES = `# Issues Log

## Open
| ID | Title | Type | Notes |
|----|-------|------|-------|
| I-3 | Referral race | bug | debounce writes |
| I-4 | Add CSV export | add | admin only |

## Solved
| ID | Title | Fix summary | Date |
|----|-------|-------------|------|
| I-1 | Login loop | guard redirect | 2026-05-29 |
`;

test("parseIssues reads open and solved tables", () => {
  const r = parseIssues(ISSUES);
  assert.equal(r.open.length, 2);
  assert.equal(r.solved.length, 1);
  assert.equal(r.open[0].id, "I-3");
  assert.equal(r.open[0].type, "bug");
  assert.equal(r.open[1].title, "Add CSV export");
  assert.equal(r.solved[0].fix, "guard redirect");
  assert.equal(r.solved[0].date, "2026-05-29");
});

test("parseIssues tolerates empty/garbage input", () => {
  assert.deepEqual(parseIssues(""), { open: [], solved: [] });
  assert.deepEqual(parseIssues(null), { open: [], solved: [] });
  assert.deepEqual(parseIssues("# just a heading\nno tables"), { open: [], solved: [] });
});

test("buildBoard maps issues + goals + phase into columns", () => {
  const issues = parseIssues(ISSUES);
  const goals = { items: [{ text: "Ship waitlist", done: true }, { text: "Live referrals", done: false }] };
  const state = { currentPhase: "build", phaseStatus: "in_progress" };
  const board = buildBoard({ issues, goals, state });

  // backlog = 2 open issues + 1 undone goal
  assert.equal(board.backlog.length, 3);
  // done = 1 solved issue + 1 done goal
  assert.equal(board.done.length, 2);
  // in progress = current phase card
  assert.equal(board.inProgress.length, 1);
  assert.equal(board.inProgress[0].kind, "phase");
  assert.ok(board.backlog.some((c) => c.kind === "issue" && c.badge === "bug"));
  assert.ok(board.backlog.some((c) => c.kind === "goal"));
});

test("buildBoard gives goals stable, unique ids across columns", () => {
  const goals = { items: [{ text: "done one", done: true }, { text: "todo one", done: false }] };
  const board = buildBoard({ goals });
  const backlogGoal = board.backlog.find((c) => c.kind === "goal");
  const doneGoal = board.done.find((c) => c.kind === "goal");
  assert.ok(backlogGoal && doneGoal);
  assert.notEqual(backlogGoal.id, doneGoal.id, "goal ids must not collide across columns");
  assert.equal(doneGoal.id, "G1"); // first item in the list
  assert.equal(backlogGoal.id, "G2");
});

test("buildBoard is safe with empty inputs", () => {
  const board = buildBoard({});
  assert.deepEqual(board.backlog, []);
  assert.deepEqual(board.done, []);
  assert.deepEqual(board.inProgress, []);
});
