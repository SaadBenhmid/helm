import { runSecurity, printFinding } from "./_context.js";

export function security() {
  const { findings, suppressed } = runSecurity(".");
  if (findings.length === 0) {
    console.log("Security scan clean. ✅");
  } else {
    for (const f of findings) printFinding(f);
    const blockers = findings.filter((f) => f.level === "block").length;
    const warns = findings.length - blockers;
    console.log(`\n${blockers} blocking, ${warns} warning finding(s). Suppress a false positive with a \`gitleaks:allow\` comment on the line.`);
  }
  if (suppressed) console.log(`ℹ ${suppressed} line(s) suppressed via gitleaks:allow — confirm they aren't hiding real secrets.`);
  if (findings.some((f) => f.level === "block")) process.exit(1);
}
