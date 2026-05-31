#!/usr/bin/env node
// Thin dispatcher: parse argv[2], look up the command, call it. All command
// implementations live in src/commands/*. Each command receives the full
// process.argv so its index-based flag parsing (argv[3], --serve position, …)
// is identical to the pre-split monolith. Unknown commands print the usage line.
import { init } from "../src/commands/init.js";
import { status } from "../src/commands/status.js";
import { advance } from "../src/commands/advance.js";
import { milestone } from "../src/commands/milestone.js";
import { hooks } from "../src/commands/hooks.js";
import { models } from "../src/commands/models.js";
import { inject } from "../src/commands/inject.js";
import { capture } from "../src/commands/capture.js";
import { lint } from "../src/commands/lint.js";
import { security } from "../src/commands/security.js";
import { score } from "../src/commands/score.js";
import { track } from "../src/commands/track.js";
import { verify } from "../src/commands/verify.js";
import { dashboard } from "../src/commands/dashboard.js";
import { frameworks } from "../src/commands/frameworks.js";
import { version } from "../src/commands/version.js";
import { snapshot } from "../src/commands/snapshot.js";
import { rollback } from "../src/commands/rollback.js";
import { log } from "../src/commands/log.js";

const USAGE =
  "Usage: helm <init [--existing] [--dry-run]|status|next|advance [--force]|milestone|hooks install|models init|inject|capture|lint|security|score|track --model M --in N --out N [--phase P] [--note ...]|verify|dashboard [out.html|--serve [port]]|frameworks [--size --rigor --ui --team]|log [message|--json]|version|snapshot [label]|rollback [id]>";

const argv = process.argv;
const cmd = argv[2];

// Map every subcommand (and its aliases) to its handler. Handlers take the full
// process.argv so flag/positional parsing matches the original inline behaviour.
const COMMANDS = {
  init,
  status,
  next: status,
  advance,
  security,
  score,
  dashboard,
  track,
  verify,
  version,
  "--version": version,
  "-v": version,
  frameworks,
  log,
  milestone,
  hooks,
  inject,
  capture,
  models,
  lint,
  snapshot,
  rollback,
};

// Central help handling, BEFORE dispatch (external audit P3). Otherwise a help
// flag on a MUTATING command (e.g. `helm snapshot --help`) would reach the handler
// and cause a side effect — creating a snapshot literally labelled "--help", or
// making `helm rollback --help` fail as a lookup for a snapshot named "--help".
// Treating help as a pre-dispatch concern keeps every command safe to introspect.
const HELP_TOKENS = new Set(["help", "--help", "-h"]);
const wantsHelp = !cmd || HELP_TOKENS.has(cmd) || argv.slice(3).some((a) => HELP_TOKENS.has(a));

const handler = Object.prototype.hasOwnProperty.call(COMMANDS, cmd) ? COMMANDS[cmd] : null;
if (wantsHelp || !handler) {
  console.log(USAGE);
} else {
  handler(argv);
}
