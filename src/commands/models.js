import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ensureGitignored, kimiEnvExample, KIMI_LAUNCHER_PS1, KIMI_LAUNCHER_SH } from "../models.js";

export function models(argv) {
  if (argv[3] === "init") {
    const gi = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
    writeFileSync(".gitignore", ensureGitignored(gi, ".env.helm"));
    if (!existsSync(".env.helm.example")) writeFileSync(".env.helm.example", kimiEnvExample());
    mkdirSync("scripts", { recursive: true });
    if (!existsSync(join("scripts", "helm-kimi.ps1"))) writeFileSync(join("scripts", "helm-kimi.ps1"), KIMI_LAUNCHER_PS1);
    if (!existsSync(join("scripts", "helm-kimi.sh"))) writeFileSync(join("scripts", "helm-kimi.sh"), KIMI_LAUNCHER_SH);
    console.log("Model env scaffolding ready: .env.helm.example + scripts/helm-kimi.(ps1|sh). `.env.helm` is git-ignored.");
    console.log("Next: copy .env.helm.example to .env.helm, add your Moonshot key, then launch builds with scripts/helm-kimi.ps1 (Windows) or scripts/helm-kimi.sh.");
  } else {
    console.log("Usage: helm models init");
  }
}
