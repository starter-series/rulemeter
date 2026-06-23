import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { classifyRisks, isHighRisk, type RiskLabel } from "./risk.js";
import { AUDIT_SCHEMA_VERSION, type RulemeterWarning } from "./schema.js";
import { loadTokenCounter, type TokenCounter } from "./tokenizer.js";

export interface Occurrence {
  path: string;
  line: number;
}

export type Recommendation = "candidate" | "keep_explicit" | "do_not_alias" | "below_breakeven";

export interface RuleCandidate {
  rule: string;
  text: string;
  repeats: number;
  occurrences: Occurrence[];
  rawTokens: number;
  aliasTokens: number;
  legendTokens: number;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  breakeven: number | null;
  risks: RiskLabel[];
  recommendation: Recommendation;
  cacheHint: "stable_prefix_candidate" | "dynamic_task_or_local_context";
}

export interface AuditOptions {
  minTokens?: number;
  minRepeats?: number;
  aliasPrefix?: string;
  counter?: TokenCounter;
}

export interface AuditReport {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  tokenizer: string;
  files: string[];
  warnings: RulemeterWarning[];
  candidates: RuleCandidate[];
}

interface Segment {
  text: string;
  line: number;
}

export function normalizeSegment(text: string): string {
  return text
    .trim()
    .replace(/^\s{0,4}(?:[-*+]|\d+[.)])\s+/u, "")
    .replace(/\s+/gu, " ");
}

export function extractSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 1;

  const flush = (): void => {
    if (paragraph.length === 0) return;
    const text = normalizeSegment(paragraph.join(" "));
    if (text.length > 0) segments.push({ text, line: paragraphStart });
    paragraph = [];
  };

  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const stripped = line.trim();

    if (stripped.length === 0) {
      flush();
      continue;
    }
    if (stripped.startsWith("#")) {
      flush();
      continue;
    }
    if (/^\s{0,4}(?:[-*+]|\d+[.)])\s+/u.test(line)) {
      flush();
      const text = normalizeSegment(line);
      if (text.length > 0) segments.push({ text, line: lineNumber });
      continue;
    }
    if (paragraph.length === 0) paragraphStart = lineNumber;
    paragraph.push(stripped);
  }

  flush();
  return segments;
}

export function computeBreakeven(rawTokens: number, aliasTokens: number, legendTokens: number): number | null {
  const perUseGain = rawTokens - aliasTokens;
  if (perUseGain <= 0) return null;
  return Math.floor(legendTokens / perUseGain) + 1;
}

function cacheHintFor(occurrences: Occurrence[]): RuleCandidate["cacheHint"] {
  const names = new Set(occurrences.map((occurrence) => basename(occurrence.path).toLowerCase()));
  if (names.has("agents.md") || names.has("claude.md")) return "stable_prefix_candidate";
  return "dynamic_task_or_local_context";
}

function recommendationFor(params: {
  repeats: number;
  savedTokens: number;
  breakeven: number | null;
  risks: RiskLabel[];
  minRepeats: number;
}): Recommendation {
  if (isHighRisk(params.risks)) return "keep_explicit";
  if (params.repeats < params.minRepeats) return "do_not_alias";
  if (params.breakeven === null) return "do_not_alias";
  if (params.savedTokens <= 0) return "do_not_alias";
  if (params.repeats < params.breakeven) return "below_breakeven";
  return "candidate";
}

function nextAvailableAlias(prefix: string, index: number, corpus: string): string {
  let candidate = `${prefix}_${String(index).padStart(2, "0")}`;
  let current = index;
  while (new RegExp(`\\b${candidate}\\b`, "u").test(corpus)) {
    current += 1;
    candidate = `${prefix}_${String(current).padStart(2, "0")}`;
  }
  return candidate;
}

export async function auditRules(paths: string[], options: AuditOptions = {}): Promise<AuditReport> {
  const minTokens = options.minTokens ?? 12;
  const minRepeats = options.minRepeats ?? 2;
  const aliasPrefix = options.aliasPrefix ?? "RULE";
  const counter = options.counter ?? loadTokenCounter();

  const fileTexts = await Promise.all(paths.map(async (path) => ({ path, text: await readFile(path, "utf8") })));
  const corpus = fileTexts.map((file) => file.text).join("\n");
  const grouped = new Map<string, Occurrence[]>();

  for (const file of fileTexts) {
    for (const segment of extractSegments(file.text)) {
      const occurrences = grouped.get(segment.text) ?? [];
      occurrences.push({ path: file.path, line: segment.line });
      grouped.set(segment.text, occurrences);
    }
  }

  const candidates: RuleCandidate[] = [];
  let index = 1;
  const entries = [...grouped.entries()].sort(([leftText, leftOccurrences], [rightText, rightOccurrences]) => {
    if (leftOccurrences.length !== rightOccurrences.length) return rightOccurrences.length - leftOccurrences.length;
    return leftText.localeCompare(rightText);
  });

  for (const [text, occurrences] of entries) {
    const repeats = occurrences.length;
    const rawTokens = counter.count(text);
    if (rawTokens < minTokens || repeats < minRepeats) continue;

    const alias = nextAvailableAlias(aliasPrefix, index, corpus);
    const aliasTokens = counter.count(alias);
    const legendTokens = counter.count(`${alias} = ${text}`);
    const originalTokens = rawTokens * repeats;
    const compressedTokens = legendTokens + aliasTokens * repeats;
    const savedTokens = originalTokens - compressedTokens;
    const breakeven = computeBreakeven(rawTokens, aliasTokens, legendTokens);
    const risks = classifyRisks(text);
    const recommendation = recommendationFor({ repeats, savedTokens, breakeven, risks, minRepeats });

    candidates.push({
      rule: alias,
      text,
      repeats,
      occurrences,
      rawTokens,
      aliasTokens,
      legendTokens,
      originalTokens,
      compressedTokens,
      savedTokens,
      breakeven,
      risks,
      recommendation,
      cacheHint: cacheHintFor(occurrences),
    });
    index += 1;
  }

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    tokenizer: counter.name,
    files: paths,
    warnings: counter.name === "fallback_regex" ? [{ code: "APPROXIMATE_TOKENIZER", message: "Token counts are approximate." }] : [],
    candidates,
  };
}
