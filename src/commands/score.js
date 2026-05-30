import { gatherProject } from "./_context.js";

export function score() {
  const { score, projectName } = gatherProject();
  console.log(`\nHelm scorecard — ${projectName}`);
  console.log(`Grade ${score.grade}   ${score.total}/100\n`);
  for (const d of score.dimensions) {
    const ratio = d.max ? d.score / d.max : 0;
    const filled = Math.round(ratio * 16);
    const bar = "█".repeat(filled) + "░".repeat(16 - filled);
    console.log(`  ${d.name.padEnd(22)} ${bar} ${String(d.score).padStart(2)}/${d.max}  ${d.detail}`);
  }
  console.log(`\n  Not yet proven (needs verify + deploy):`);
  for (const p of score.pending) console.log(`   ○ ${p.name} — ${p.why}`);
  console.log("");
}
