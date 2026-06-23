import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface RulemeterConfig {
  aliasPrefix?: string;
  allowFallback?: boolean;
  encoding?: string;
  minRepeats?: number;
  minTokens?: number;
  model?: string;
}

export interface LoadedRulemeterConfig {
  config: RulemeterConfig;
  path: string | null;
}

function assertObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function optionalBoolean(value: unknown, key: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function optionalPositiveInteger(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${key} must be a positive integer`);
  return Number(value);
}

export async function loadRulemeterConfigWithMeta(configPath?: string): Promise<LoadedRulemeterConfig> {
  const path = configPath ?? join(process.cwd(), "rulemeter.config.json");
  if (!existsSync(path)) {
    if (configPath) throw new Error(`config file not found: ${path}`);
    return { config: {}, path: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`failed to read config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  assertObject(parsed, path);
  return {
    config: {
      aliasPrefix: optionalString(parsed.aliasPrefix, "aliasPrefix"),
      allowFallback: optionalBoolean(parsed.allowFallback, "allowFallback"),
      encoding: optionalString(parsed.encoding, "encoding"),
      minRepeats: optionalPositiveInteger(parsed.minRepeats, "minRepeats"),
      minTokens: optionalPositiveInteger(parsed.minTokens, "minTokens"),
      model: optionalString(parsed.model, "model"),
    },
    path,
  };
}

export async function loadRulemeterConfig(configPath?: string): Promise<RulemeterConfig> {
  return (await loadRulemeterConfigWithMeta(configPath)).config;
}
