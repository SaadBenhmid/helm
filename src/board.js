// Pure helpers that turn Helm's memory into a Jira-style board model.
//   parseIssues(md)            → { open:[{id,title,type,notes}], solved:[{id,title,fix,date}] }
//   buildBoard({issues,goals,state}) → { backlog:[card], inProgress:[card], done:[card] }
// A card: { kind:"issue"|"goal"|"phase", id, title, badge, note }.

function rowCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}
const isSeparator = (cells) => cells.every((c) => c === "" || /^[-:\s]+$/.test(c));

export function parseIssues(md) {
  const out = { open: [], solved: [] };
  if (typeof md !== "string") return out;
  let section = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const t = h[1].trim().toLowerCase();
      section = t.startsWith("open") ? "open" : t.startsWith("solved") ? "solved" : null;
      continue;
    }
    if (!section || !line.trim().startsWith("|")) continue;
    const cells = rowCells(line);
    if (isSeparator(cells) || /^id\b/i.test(cells[0] || "")) continue; // separator or header row (e.g. "ID", "Issue ID")
    if (section === "open") {
      out.open.push({ id: cells[0] || "", title: cells[1] || "", type: cells[2] || "", notes: cells[3] || "" });
    } else {
      out.solved.push({ id: cells[0] || "", title: cells[1] || "", fix: cells[2] || "", date: cells[3] || "" });
    }
  }
  return out;
}

export function buildBoard({ issues = { open: [], solved: [] }, goals = { items: [] }, state = {} } = {}) {
  const open = (issues && issues.open) || [];
  const solved = (issues && issues.solved) || [];
  const items = (goals && goals.items) || [];

  // Index goals over the FULL items array so a goal's id (G1, G2…) is stable and unique
  // whether it lands in backlog or done — never colliding across columns.
  const goalCards = items.map((g, idx) => ({ g, idx })).filter(({ g }) => g);
  const backlog = [
    ...open.map((i) => ({ kind: "issue", id: i.id, title: i.title, badge: i.type || "issue", note: i.notes || "" })),
    ...goalCards.filter(({ g }) => !g.done).map(({ g, idx }) => ({ kind: "goal", id: `G${idx + 1}`, title: g.text, badge: "goal", note: "" })),
  ];
  const done = [
    ...solved.map((i) => ({ kind: "issue", id: i.id, title: i.title, badge: "solved", note: i.fix || "" })),
    ...goalCards.filter(({ g }) => g.done).map(({ g, idx }) => ({ kind: "goal", id: `G${idx + 1}`, title: g.text, badge: "done", note: "" })),
  ];
  const cur = state && state.currentPhase;
  const inProgress = cur
    ? [{ kind: "phase", id: cur, title: `Phase: ${cur}`, badge: (state && state.phaseStatus) || "in_progress", note: "current milestone work" }]
    : [];

  return { backlog, inProgress, done };
}
