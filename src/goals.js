// goals.js — pure logic for parsing acceptance-criteria / UAT checkboxes from markdown.
// Zero dependencies (no imports). Mirrors the pure-module style of src/lint.js etc.

// Matches a markdown task line, e.g. "- [ ] text", "* [x] text", "+ [X] text".
// Allows leading whitespace and "-", "*", or "+" as the list marker.
const TASK_RE = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/;

/**
 * Parse markdown task list lines into goal items.
 *
 * @param {string} md - markdown source text.
 * @returns {{ total: number, done: number, items: Array<{ text: string, done: boolean }> }}
 */
export function parseGoals(md) {
  if (!md) return { total: 0, done: 0, items: [] };

  const items = [];
  let done = 0;

  for (const line of String(md).split(/\r?\n/)) {
    const m = TASK_RE.exec(line);
    if (!m) continue; // ignore non-task lines

    const isDone = m[1] === 'x' || m[1] === 'X';
    const text = m[2].trim();

    if (isDone) done++;
    items.push({ text, done: isDone });
  }

  return { total: items.length, done, items };
}
