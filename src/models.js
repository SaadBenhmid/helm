// Helpers for persisting the build-model env vars so the user doesn't re-enter
// them each session. The secret-bearing `.env.helm` is written by the agent (or
// copied from the example); this module owns the safe, non-secret scaffolding.

// Idempotently ensure a .gitignore contains an entry.
export function ensureGitignored(content = "", entry) {
  const lines = content.split(/\r?\n/);
  if (lines.some((l) => l.trim() === entry)) return content;
  const base = content.length && !content.endsWith("\n") ? content + "\n" : content;
  return base + entry + "\n";
}

// The example env file (no real secret). Copied to .env.helm and filled in.
export function kimiEnvExample() {
  return [
    "# Helm build-model env. Copy this file to .env.helm and fill in your key.",
    "# .env.helm is git-ignored — never commit your key.",
    "ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic",
    "ANTHROPIC_AUTH_TOKEN=replace-with-your-moonshot-key",
    "ANTHROPIC_MODEL=kimi-k2.6",
    "ANTHROPIC_SMALL_FAST_MODEL=kimi-k2.6",
    "",
  ].join("\n");
}

// Launcher that loads .env.helm and starts Claude Code in "Kimi build" mode.
export const KIMI_LAUNCHER_PS1 = `# Launch Claude Code with the Kimi build model from .env.helm
if (-not (Test-Path .env.helm)) { Write-Error ".env.helm not found - copy .env.helm.example and add your key."; exit 1 }
Get-Content .env.helm | Where-Object { $_ -match '^[^#].*=' } | ForEach-Object {
  $p = $_ -split '=', 2
  Set-Item -Path ("Env:" + $p[0].Trim()) -Value $p[1].Trim().Trim('"')
}
claude
`;

export const KIMI_LAUNCHER_SH = `#!/usr/bin/env bash
# Launch Claude Code with the Kimi build model from .env.helm
if [ ! -f .env.helm ]; then echo ".env.helm not found - copy .env.helm.example and add your key." >&2; exit 1; fi
set -a; . ./.env.helm; set +a
claude
`;
