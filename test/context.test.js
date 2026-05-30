import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("CLAUDE.md defines the always-on context & memory protocol", () => {
  const md = readFileSync("CLAUDE.md", "utf8");
  assert.match(md, /context\s*&\s*memory/i);
  assert.match(md, /handoff/i);
  assert.match(md, /40%/);
  assert.match(md, /rehydrate/i);
});

test("bootstrap rehydrates cheaply and clears between phases", () => {
  const md = readFileSync("skills/helm-bootstrap/SKILL.md", "utf8");
  assert.match(md, /\.helm/);
  assert.match(md, /rehydrate/i);
  assert.match(md, /clear/i);
});

const phaseSkills = [
  "skills/helm-adopt/SKILL.md",
  "skills/helm-validate/SKILL.md",
  "skills/helm-prd/SKILL.md",
  "skills/helm-mockup/SKILL.md",
  "skills/helm-setup/SKILL.md",
  "skills/helm-build/SKILL.md",
  "skills/helm-ship/SKILL.md",
];

for (const p of phaseSkills) {
  test(`${p} carries the context & memory discipline`, () => {
    const md = readFileSync(p, "utf8");
    assert.match(md, /handoff/i);
    assert.match(md, /clear|compact/i);
    assert.match(md, /40%/);
  });
}
