import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RulemeterError } from "./errors.js";

export interface RulemeterConfig {
  minChars?: number;
  minRepeats?: number;
}

export interface LoadedRulemeterConfig {
  config: RulemeterConfig;
  path: string | null;
}

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RulemeterError("CONFIG_INVALID", `${path} must contain a JSON object`);
  }
}

function optionalPositiveInteger(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new RulemeterError("CONFIG_INVALID", `${key} must be a positive integer`);
  }
  return Number(value);
}

export async function loadRulemeterConfigWithMeta(configPath?: string): Promise<LoadedRulemeterConfig> {
  const path = configPath ?? join(process.cwd(), "rulemeter.config.json");
  if (!existsSync(path)) {
    if (configPath) throw new RulemeterError("CONFIG_NOT_FOUND", `config file not found: ${path}`);
    return { config: {}, path: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new RulemeterError(
      "CONFIG_INVALID_JSON",
      `failed to read config ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  assertObject(parsed, path);
  return {
    config: {
      minChars: optionalPositiveInteger(parsed.minChars, "minChars"),
      minRepeats: optionalPositiveInteger(parsed.minRepeats, "minRepeats"),
    },
    path,
  };
}

export async function loadRulemeterConfig(configPath?: string): Promise<RulemeterConfig> {
  return (await loadRulemeterConfigWithMeta(configPath)).config;
}
