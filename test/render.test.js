import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStateMd } from "../src/render.js";

test("renders phase, status and next action", () => {
  const md = renderStateMd(
    { currentPhase: "validate", phaseStatus: "in_progress", updatedAt: "2026-05-29T00:00:00Z" },
    { phase: "validate", available: true, message: "Do the validation." }
  );
  assert.match(md, /Current phase:\*\* validate/);
  assert.match(md, /Status:\*\* in_progress/);
  assert.match(md, /Do the validation\./);
});
