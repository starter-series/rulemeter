#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { auditRules } from "./audit.js";
import { loadRulemeterConfigWithMeta, type RulemeterConfig } from "./config.js";
import { RulemeterError } from "./errors.js";
import { formatAuditMarkdown, formatAuditTable } from "./format.js";
import { discoverPresetFiles, presetNames } from "./presets.js";
import { COUNT_SCHEMA_VERSION, DISCOVERY_SCHEMA_VERSION, ERROR_SCHEMA_VERSION } from "./schema.js";
import { loadTokenCounter, TokenizerLoadError } from "./tokenizer.js";

const VERSION = "0.1.0";

function help(): string {
  return `rulemeter — audit agent instruction files for alias break-even and compression risk.

Usage
  rulemeter audit <file...> [--json] [--format table|markdown|json] [--fail-on duplicate|risk|candidate|similar] [--experimental-similar] [--similarity-threshold N] [--config PATH] [--preset NAME] [--list-files] [--encoding NAME] [--model NAME] [--allow-fallback] [--min-tokens N] [--min-repeats N] [--alias-prefix RULE]
  rulemeter count <text> [--json] [--config PATH] [--encoding NAME] [--model NAME] [--allow-fallback]
  rulemeter --version
  rulemeter --help

Examples
  rulemeter audit AGENTS.md CLAUDE.md task.txt
  rulemeter audit AGENTS.md --json --encoding cl100k_base
  rulemeter audit --preset all --format markdown
  rulemeter audit --preset all --fail-on duplicate
  rulemeter audit --preset all --experimental-similar --format markdown
  rulemeter audit AGENTS.md --config rulemeter.config.json
  rulemeter audit --preset all --list-files
  rulemeter count "RULE_01 = preserve existing module boundaries" --encoding o200k_base
`;
}

class CliError extends RulemeterError {}

type AuditFormat = "table" | "markdown" | "json";
type FailOn = "duplicate" | "risk" | "candidate" | "similar";

function takeValue(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new CliError("INVALID_OPTION", `${flag} requires a value`);
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

function thresholdNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new CliError("INVALID_OPTION", `${flag} must be a number greater than 0 and at most 1`);
  }
  return parsed;
}

function mergeString(cliValue: string, configValue: string | undefined, fallback: string): string {
  return cliValue || configValue || fallback;
}

function assertTokenizerChoice(encoding: string, model: string): void {
  if (encoding && model) throw new CliError("INVALID_OPTION", "--encoding and --model are mutually exclusive");
}

function assertAliasPrefix(prefix: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(prefix)) {
    throw new CliError("INVALID_ALIAS_PREFIX", "--alias-prefix must start with a letter and contain only letters or digits");
  }
}

function parseAuditFormat(value: string, json: boolean): AuditFormat {
  if (json && value && value !== "json") throw new CliError("INVALID_OPTION", "--json cannot be combined with --format table or --format markdown");
  if (json) return "json";
  if (!value) return "table";
  if (value === "table" || value === "markdown" || value === "json") return value;
  throw new CliError("INVALID_OPTION", "--format must be one of: table, markdown, json");
}

function parseFailOn(value: string): FailOn | null {
  if (!value) return null;
  if (value === "duplicate" || value === "risk" || value === "candidate" || value === "similar") return value;
  throw new CliError("INVALID_OPTION", "--fail-on must be one of: duplicate, risk, candidate, similar");
}

function assertPreset(preset: string): void {
  if (preset && !(presetNames as string[]).includes(preset)) {
    throw new CliError("INVALID_OPTION", `--preset must be one of: ${presetNames.join(", ")}`);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function assertFiles(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) throw new CliError("FILE_NOT_FOUND", `file not found: ${path}`);
    if (!statSync(path).isFile()) throw new CliError("NOT_A_FILE", `not a file: ${path}`);
  }
}

function assertFilesFound(paths: string[], preset: string): void {
  if (paths.length > 0) return;
  if (preset) {
    throw new CliError(
      "NO_FILES_FOUND",
      `no files found for preset "${preset}". Run from a repo root, pass explicit files, or use --list-files to preview discovery.`,
    );
  }
  throw new CliError("NO_FILES_FOUND", "audit requires at least one file");
}

function failOnMatched(report: Awaited<ReturnType<typeof auditRules>>, failOn: FailOn | null): boolean {
  if (!failOn) return false;
  if (failOn === "duplicate") return report.candidates.some((candidate) => candidate.recommendation === "remove_duplicate");
  if (failOn === "risk") return report.candidates.some((candidate) => candidate.risks.length > 0);
  if (failOn === "similar") return report.similarCandidates.length > 0;
  return report.candidates.some((candidate) => candidate.recommendation === "candidate");
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
    const loadedConfig = await loadRulemeterConfigWithMeta(configPath || undefined);
    const config: RulemeterConfig = loadedConfig.config;
    const json = takeBool(args, "--json");
    const format = parseAuditFormat(takeValue(args, "--format", ""), json);
    const failOn = parseFailOn(takeValue(args, "--fail-on", ""));
    const listFiles = takeBool(args, "--list-files");
    const includeSimilar = takeBool(args, "--experimental-similar");
    const similarityThreshold = thresholdNumber(takeValue(args, "--similarity-threshold", "0.65"), "--similarity-threshold");
    const preset = takeValue(args, "--preset", "");
    assertPreset(preset);
    const allowFallback = takeBool(args, "--allow-fallback") || config.allowFallback === true;
    const minTokens = positiveInteger(takeValue(args, "--min-tokens", String(config.minTokens ?? 12)), "--min-tokens");
    const minRepeats = positiveInteger(takeValue(args, "--min-repeats", String(config.minRepeats ?? 2)), "--min-repeats");
    const aliasPrefix = takeValue(args, "--alias-prefix", config.aliasPrefix ?? "RULE");
    assertAliasPrefix(aliasPrefix);
    const encoding = mergeString(takeValue(args, "--encoding", ""), config.encoding, "");
    const model = mergeString(takeValue(args, "--model", ""), config.model, "");
    assertTokenizerChoice(encoding, model);
    assertNoUnknownFlags(args);
    const discoveredFiles = preset ? await discoverPresetFiles(preset) : [];
    const files = unique([...args, ...discoveredFiles]);

    if (listFiles) {
      const payload = {
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        configPath: loadedConfig.path,
        preset: preset || null,
        files,
      };
      if (json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        if (loadedConfig.path) console.log(`config: ${loadedConfig.path}`);
        if (preset) console.log(`preset: ${preset}`);
        console.log(files.join("\n"));
      }
      return 0;
    }

    assertFilesFound(files, preset);
    assertFiles(files);
    const counter = loadTokenCounter({ allowFallback, encoding: encoding || undefined, model: model || undefined });
    const report = await auditRules(files, { minTokens, minRepeats, aliasPrefix, counter, includeSimilar, similarityThreshold });
    report.configPath = loadedConfig.path;
    report.preset = preset || null;
    report.discoveredFiles = discoveredFiles;
    if (format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else if (format === "markdown") {
      console.log(formatAuditMarkdown(report));
    } else {
      console.log(formatAuditTable(report));
    }
    const failed = failOnMatched(report, failOn);
    if (failed) console.error(`rulemeter: --fail-on ${failOn} matched`);
    return failed ? 1 : 0;
  }

  if (command === "count") {
    const configPath = takeValue(args, "--config", "");
    const loadedConfig = await loadRulemeterConfigWithMeta(configPath || undefined);
    const config: RulemeterConfig = loadedConfig.config;
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
      configPath: loadedConfig.path,
      tokenizer: counter.name,
      warnings: counter.name === "fallback_regex" ? [{ code: "APPROXIMATE_TOKENIZER", message: "Token counts are approximate." }] : [],
      tokens: counter.count(text),
      text,
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`tokenizer: ${payload.tokenizer}`);
      if (payload.configPath) console.log(`config: ${payload.configPath}`);
      console.log(`tokens: ${payload.tokens}`);
    }
    return 0;
  }

  throw new CliError("UNKNOWN_COMMAND", `unknown command: ${command ?? ""}`);
}

function errorPayload(error: unknown): { schemaVersion: typeof ERROR_SCHEMA_VERSION; error: { code: string; message: string } } {
  if (error instanceof RulemeterError) {
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
  if (error instanceof RulemeterError) return error.exitCode;
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
