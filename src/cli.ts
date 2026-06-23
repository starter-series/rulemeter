#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { auditRules } from "./audit.js";
import { formatAuditTable } from "./format.js";
import { loadTokenCounter } from "./tokenizer.js";

const VERSION = "0.1.0";

function help(): string {
  return `rulemeter — audit agent instruction files for alias break-even and compression risk.

Usage
  rulemeter audit <file...> [--json] [--encoding NAME] [--model NAME] [--min-tokens N] [--min-repeats N] [--alias-prefix RULE]
  rulemeter count <text> [--json] [--encoding NAME] [--model NAME]
  rulemeter --version
  rulemeter --help

Examples
  rulemeter audit AGENTS.md CLAUDE.md task.txt
  rulemeter audit AGENTS.md --json --encoding cl100k_base
  rulemeter count "RULE_01 = preserve existing module boundaries" --encoding o200k_base
`;
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
    const json = takeBool(args, "--json");
    const minTokens = Number(takeValue(args, "--min-tokens", "12"));
    const minRepeats = Number(takeValue(args, "--min-repeats", "2"));
    const aliasPrefix = takeValue(args, "--alias-prefix", "RULE");
    const encoding = takeValue(args, "--encoding", "");
    const model = takeValue(args, "--model", "");
    if (!Number.isInteger(minTokens) || minTokens < 1) throw new Error("--min-tokens must be a positive integer");
    if (!Number.isInteger(minRepeats) || minRepeats < 1) throw new Error("--min-repeats must be a positive integer");
    assertFiles(args);
    const counter = loadTokenCounter({ encoding: encoding || undefined, model: model || undefined });
    const report = await auditRules(args, { minTokens, minRepeats, aliasPrefix, counter });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatAuditTable(report));
    }
    return 0;
  }

  if (command === "count") {
    const json = takeBool(args, "--json");
    const encoding = takeValue(args, "--encoding", "");
    const model = takeValue(args, "--model", "");
    const text = args.join(" ");
    if (text.length === 0) throw new Error("count requires text");
    const counter = loadTokenCounter({ encoding: encoding || undefined, model: model || undefined });
    const payload = { tokenizer: counter.name, tokens: counter.count(text), text };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`tokenizer: ${payload.tokenizer}`);
      console.log(`tokens: ${payload.tokens}`);
    }
    return 0;
  }

  throw new Error(`unknown command: ${command ?? ""}`);
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`rulemeter: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
