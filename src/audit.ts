import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { classifyRisks, isHighRisk, type RiskLabel } from "./risk.js";
import { AUDIT_SCHEMA_VERSION, type RulemeterWarning } from "./schema.js";
import { loadTokenCounter, type TokenCounter } from "./tokenizer.js";

export interface Occurrence {
  path: string;
  line: number;
}

export type Recommendation = "candidate" | "keep_explicit" | "remove_duplicate" | "do_not_alias" | "below_breakeven";

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
  duplicateSavedTokens: number;
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

export interface AuditDocument {
  id: string;
  text: string;
}

export interface AuditReport {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  configPath?: string | null;
  discoveredFiles?: string[];
  tokenizer: string;
  preset?: string | null;
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
  let listItem: string[] = [];
  let listItemStart = 1;
  let inFence = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = normalizeSegment(paragraph.join(" "));
    if (text.length > 0) segments.push({ text, line: paragraphStart });
    paragraph = [];
  };
  const flushListItem = (): void => {
    if (listItem.length === 0) return;
    const text = normalizeSegment(listItem.join(" "));
    if (text.length > 0) segments.push({ text, line: listItemStart });
    listItem = [];
  };
  const flush = (): void => {
    flushParagraph();
    flushListItem();
  };

  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const stripped = line.trim();
    const isListMarker = /^\s{0,4}(?:[-*+]|\d+[.)])\s+/u.test(line);

    if (/^(```|~~~)/u.test(stripped)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (stripped.length === 0) {
      flush();
      continue;
    }
    if (stripped.startsWith("#")) {
      flush();
      continue;
    }
    if (stripped.startsWith(">")) {
      flush();
      continue;
    }
    if (/^\|.*\|$/u.test(stripped)) {
      flush();
      continue;
    }
    if (/^(?: {4}|\t)/u.test(line) && listItem.length === 0) {
      flush();
      continue;
    }
    if (isListMarker) {
      flush();
      listItemStart = lineNumber;
      listItem = [line];
      continue;
    }
    if (listItem.length > 0) {
      listItem.push(stripped);
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
  if (params.repeats > 1) return "remove_duplicate";
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

export async function auditDocuments(documents: AuditDocument[], options: AuditOptions = {}): Promise<AuditReport> {
  const minTokens = options.minTokens ?? 12;
  const minRepeats = options.minRepeats ?? 2;
  const aliasPrefix = options.aliasPrefix ?? "RULE";
  const counter = options.counter ?? loadTokenCounter();

  const corpus = documents.map((document) => document.text).join("\n");
  const grouped = new Map<string, Occurrence[]>();

  for (const document of documents) {
    for (const segment of extractSegments(document.text)) {
      const occurrences = grouped.get(segment.text) ?? [];
      occurrences.push({ path: document.id, line: segment.line });
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
    const duplicateSavedTokens = rawTokens * (repeats - 1);
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
      duplicateSavedTokens,
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
    files: documents.map((document) => document.id),
    warnings: counter.name === "fallback_regex" ? [{ code: "APPROXIMATE_TOKENIZER", message: "Token counts are approximate." }] : [],
    candidates,
  };
}

export async function auditRules(paths: string[], options: AuditOptions = {}): Promise<AuditReport> {
  const documents = await Promise.all(paths.map(async (path) => ({ id: path, text: await readFile(path, "utf8") })));
  return auditDocuments(documents, options);
}
