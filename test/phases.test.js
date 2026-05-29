import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cases = [
  ["skills/helm-prd/SKILL.md", /name:\s*helm-prd/, /PRD\.md/],
  ["skills/helm-mockup/SKILL.md", /name:\s*helm-mockup/, /DESIGN\.md/],
  ["skills/helm-setup/SKILL.md", /name:\s*helm-setup/, /serena/i],
  ["skills/helm-build/SKILL.md", /name:\s*helm-build/, /slice/i],
  ["skills/helm-ship/SKILL.md", /name:\s*helm-ship/, /secrets/i],
];

for (const [path, nameRe, bodyRe] of cases) {
  test(`${path} has frontmatter + key content`, () => {
    const md = readFileSync(path, "utf8");
    assert.match(md, nameRe);
    assert.match(md, bodyRe);
  });
}

test("phase skills advise running helm advance", () => {
  for (const [path] of cases) {
    assert.match(readFileSync(path, "utf8"), /helm advance|helm\.js advance/);
  }
});
