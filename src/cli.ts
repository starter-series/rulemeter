#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { auditRules } from "./audit.js";
import { loadRulemeterConfig, type RulemeterConfig } from "./config.js";
import { formatAuditTable } from "./format.js";
import { COUNT_SCHEMA_VERSION, ERROR_SCHEMA_VERSION } from "./schema.js";
import { loadTokenCounter, TokenizerLoadError } from "./tokenizer.js";

const VERSION = "0.1.0";

function help(): string {
  return `rulemeter — audit agent instruction files for alias break-even and compression risk.

Usage
  rulemeter audit <file...> [--json] [--config PATH] [--encoding NAME] [--model NAME] [--allow-fallback] [--min-tokens N] [--min-repeats N] [--alias-prefix RULE]
  rulemeter count <text> [--json] [--config PATH] [--encoding NAME] [--model NAME] [--allow-fallback]
  rulemeter --version
  rulemeter --help

Examples
  rulemeter audit AGENTS.md CLAUDE.md task.txt
  rulemeter audit AGENTS.md --json --encoding cl100k_base
  rulemeter audit AGENTS.md --config rulemeter.config.json
  rulemeter count "RULE_01 = preserve existing module boundaries" --encoding o200k_base
`;
}

class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode = 2) {
    super(message);
  }
}

function takeValue(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeBool(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function assertNoUnknownFlags(args: string[]): void {
  const flag = args.find((arg) => arg.startsWith("--"));
  if (flag) throw new CliError("UNKNOWN_FLAG", `unknown flag: ${flag}`);
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new CliError("INVALID_OPTION", `${flag} must be a positive integer`);
  return parsed;
}

function mergeString(cliValue: string, configValue: string | undefined, fallback: string): string {
  return cliValue || configValue || fallback;
}

function assertTokenizerChoice(encoding: string, model: string): void {
  if (encoding && model) throw new CliError("INVALID_OPTION", "--encoding and --model are mutually exclusive");
}

function assertFiles(paths: string[]): void {
  if (paths.length === 0) throw new Error("audit requires at least one file");
  for (const path of paths) {
    if (!existsSync(path)) throw new Error(`file not found: ${path}`);
    if (!statSync(path).isFile()) throw new Error(`not a file: ${path}`);
  }
}

async function run(argv: string[]): Promise<number> {
  const args = [...argv];
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(help());
    return 0;
  }
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(`rulemeter ${VERSION}`);
    return 0;
  }

  const command = args.shift();
  if (command === "audit") {
    const configPath = takeValue(args, "--config", "");
    const config: RulemeterConfig = await loadRulemeterConfig(configPath || undefined);
    const json = takeBool(args, "--json");
    const allowFallback = takeBool(args, "--allow-fallback") || config.allowFallback === true;
    const minTokens = positiveInteger(takeValue(args, "--min-tokens", String(config.minTokens ?? 12)), "--min-tokens");
    const minRepeats = positiveInteger(takeValue(args, "--min-repeats", String(config.minRepeats ?? 2)), "--min-repeats");
    const aliasPrefix = takeValue(args, "--alias-prefix", config.aliasPrefix ?? "RULE");
    const encoding = mergeString(takeValue(args, "--encoding", ""), config.encoding, "");
    const model = mergeString(takeValue(args, "--model", ""), config.model, "");
    assertTokenizerChoice(encoding, model);
    assertNoUnknownFlags(args);
    assertFiles(args);
    const counter = loadTokenCounter({ allowFallback, encoding: encoding || undefined, model: model || undefined });
    const report = await auditRules(args, { minTokens, minRepeats, aliasPrefix, counter });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatAuditTable(report));
    }
    return 0;
  }

  if (command === "count") {
    const configPath = takeValue(args, "--config", "");
    const config: RulemeterConfig = await loadRulemeterConfig(configPath || undefined);
    const json = takeBool(args, "--json");
    const allowFallback = takeBool(args, "--allow-fallback") || config.allowFallback === true;
    const encoding = mergeString(takeValue(args, "--encoding", ""), config.encoding, "");
    const model = mergeString(takeValue(args, "--model", ""), config.model, "");
    assertTokenizerChoice(encoding, model);
    assertNoUnknownFlags(args);
    const text = args.join(" ");
    if (text.length === 0) throw new CliError("MISSING_TEXT", "count requires text");
    const counter = loadTokenCounter({ allowFallback, encoding: encoding || undefined, model: model || undefined });
    const payload = {
      schemaVersion: COUNT_SCHEMA_VERSION,
      tokenizer: counter.name,
      warnings: counter.name === "fallback_regex" ? [{ code: "APPROXIMATE_TOKENIZER", message: "Token counts are approximate." }] : [],
      tokens: counter.count(text),
      text,
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`tokenizer: ${payload.tokenizer}`);
      console.log(`tokens: ${payload.tokens}`);
    }
    return 0;
  }

  throw new CliError("UNKNOWN_COMMAND", `unknown command: ${command ?? ""}`);
}

function errorPayload(error: unknown): { schemaVersion: typeof ERROR_SCHEMA_VERSION; error: { code: string; message: string } } {
  if (error instanceof CliError) {
    return { schemaVersion: ERROR_SCHEMA_VERSION, error: { code: error.code, message: error.message } };
  }
  if (error instanceof TokenizerLoadError) {
    return { schemaVersion: ERROR_SCHEMA_VERSION, error: { code: error.code, message: error.message } };
  }
  return {
    schemaVersion: ERROR_SCHEMA_VERSION,
    error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) },
  };
}

function exitCode(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  if (error instanceof TokenizerLoadError) return 2;
  return 1;
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const payload = errorPayload(error);
    if (process.argv.slice(2).includes("--json")) {
      console.error(JSON.stringify(payload, null, 2));
    } else {
      console.error(`rulemeter: ${payload.error.message}`);
    }
    process.exitCode = exitCode(error);
  },
);
