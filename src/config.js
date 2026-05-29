import { readFileSync, existsSync } from "node:fs";

export function defaultConfig() {
  return {
    helmVersion: "0.1.0",
    project: "untitled",
    slots: {
      framework: null,
      models: { plan: "claude-opus", build: "kimi-k2.6", review: "claude-opus" },
      mockupTool: null,
      indexer: "serena",
    },
    contextCapTarget: 40,
    contextCapHard: 50,
    comms: "non-technical",
    strictness: "soft",
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") throw new Error("config must be an object");
  for (const key of ["slots", "contextCapTarget", "contextCapHard", "comms", "strictness"]) {
    if (!(key in config)) throw new Error(`config missing required key: ${key}`);
  }
  if (config.contextCapHard < config.contextCapTarget) {
    throw new Error("contextCapHard must be >= contextCapTarget");
  }
  return true;
}

export function readConfig(path) {
  if (!existsSync(path)) throw new Error(`config file not found: ${path}`);
  const config = JSON.parse(readFileSync(path, "utf8"));
  validateConfig(config);
  return config;
}
