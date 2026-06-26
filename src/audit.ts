import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { classifyRisks, isHighRisk, type RiskLabel } from "./risk.js";
import { AUDIT_SCHEMA_VERSION, type RulemeterWarning } from "./schema.js";

export interface Occurrence {
  path: string;
  line: number;
}

export type CacheHint = "stable_prefix_candidate" | "dynamic_task_or_local_context";
export type Recommendation = "keep_explicit" | "remove_duplicate" | "review_duplicate";

export interface RuleCandidate {
  id: string;
  text: string;
  repeats: number;
  occurrences: Occurrence[];
  chars: number;
  risks: RiskLabel[];
  recommendation: Recommendation;
  cacheHint: CacheHint;
}

export interface RiskFinding {
  text: string;
  occurrences: Occurrence[];
  chars: number;
  risks: RiskLabel[];
  cacheHint: CacheHint;
}

export type SimilarRecommendation = "review_similar" | "keep_explicit";

export interface SimilarRuleCandidate {
  id: string;
  texts: string[];
  repeats: number;
  occurrences: Occurrence[];
  similarity: number;
  risks: RiskLabel[];
  recommendation: SimilarRecommendation;
  cacheHint: CacheHint;
}

export interface AuditOptions {
  minChars?: number;
  minRepeats?: number;
  includeSimilar?: boolean;
  similarityThreshold?: number;
}

export interface AuditDocument {
  id: string;
  text: string;
}

export interface AuditReport {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  configPath?: string | null;
  discoveredFiles?: string[];
  preset?: string | null;
  files: string[];
  warnings: RulemeterWarning[];
  candidates: RuleCandidate[];
  riskFindings: RiskFinding[];
  similarCandidates: SimilarRuleCandidate[];
}

interface Segment {
  text: string;
  line: number;
}

interface SegmentGroup {
  text: string;
  occurrences: Occurrence[];
  chars: number;
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

function cacheHintFor(occurrences: Occurrence[]): CacheHint {
  const names = new Set(occurrences.map((occurrence) => basename(occurrence.path).toLowerCase()));
  if (names.has("agents.md") || names.has("claude.md")) return "stable_prefix_candidate";
  return "dynamic_task_or_local_context";
}

function uniqueRisks(risks: RiskLabel[]): RiskLabel[] {
  return [...new Set(risks)].sort((left, right) => left.localeCompare(right)) as RiskLabel[];
}

function hasSameFileRepeat(occurrences: Occurrence[]): boolean {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) counts.set(occurrence.path, (counts.get(occurrence.path) ?? 0) + 1);
  return [...counts.values()].some((count) => count > 1);
}

function recommendationFor(risks: RiskLabel[], occurrences: Occurrence[]): Recommendation {
  if (isHighRisk(risks)) return "keep_explicit";
  return hasSameFileRepeat(occurrences) ? "remove_duplicate" : "review_duplicate";
}

function wordSet(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= 3));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function findSimilarCandidates(groups: SegmentGroup[], threshold: number): SimilarRuleCandidate[] {
  const eligible = groups
    .filter((group) => group.occurrences.length === 1)
    .map((group) => ({ ...group, words: wordSet(group.text) }));
  const candidates: SimilarRuleCandidate[] = [];

  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    const left = eligible[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const right = eligible[rightIndex];
      if (!right) continue;
      if (left.text === right.text) continue;
      const similarity = jaccard(left.words, right.words);
      if (similarity < threshold) continue;
      const occurrences = [...left.occurrences, ...right.occurrences];
      const risks = uniqueRisks([...classifyRisks(left.text), ...classifyRisks(right.text)]);
      candidates.push({
        id: `SIM_${String(candidates.length + 1).padStart(2, "0")}`,
        texts: [left.text, right.text],
        repeats: occurrences.length,
        occurrences,
        similarity: Number(similarity.toFixed(3)),
        risks,
        recommendation: isHighRisk(risks) ? "keep_explicit" : "review_similar",
        cacheHint: cacheHintFor(occurrences),
      });
    }
  }

  return candidates.sort((left, right) => right.similarity - left.similarity || left.texts[0].localeCompare(right.texts[0]));
}

function findRiskFindings(groups: SegmentGroup[]): RiskFinding[] {
  return groups
    .map((group) => ({ ...group, risks: classifyRisks(group.text) }))
    .filter((group) => group.risks.length > 0)
    .map((group) => ({
      text: group.text,
      occurrences: group.occurrences,
      chars: group.chars,
      risks: group.risks,
      cacheHint: cacheHintFor(group.occurrences),
    }))
    .sort((left, right) => left.occurrences[0].path.localeCompare(right.occurrences[0].path) || left.occurrences[0].line - right.occurrences[0].line);
}

export async function auditDocuments(documents: AuditDocument[], options: AuditOptions = {}): Promise<AuditReport> {
  const minChars = options.minChars ?? 40;
  const minRepeats = options.minRepeats ?? 2;
  const includeSimilar = options.includeSimilar ?? false;
  const similarityThreshold = options.similarityThreshold ?? 0.65;
  const grouped = new Map<string, Occurrence[]>();

  for (const document of documents) {
    for (const segment of extractSegments(document.text)) {
      const occurrences = grouped.get(segment.text) ?? [];
      occurrences.push({ path: document.id, line: segment.line });
      grouped.set(segment.text, occurrences);
    }
  }

  const entries = [...grouped.entries()].sort(([leftText, leftOccurrences], [rightText, rightOccurrences]) => {
    if (leftOccurrences.length !== rightOccurrences.length) return rightOccurrences.length - leftOccurrences.length;
    return leftText.localeCompare(rightText);
  });
  const segmentGroups: SegmentGroup[] = entries.map(([text, occurrences]) => ({ text, occurrences, chars: text.length }));
  const riskFindings = findRiskFindings(segmentGroups);

  const candidates: RuleCandidate[] = [];
  for (const { text, occurrences, chars } of segmentGroups) {
    const repeats = occurrences.length;
    if (chars < minChars || repeats < minRepeats) continue;
    const risks = classifyRisks(text);

    candidates.push({
      id: `DUP_${String(candidates.length + 1).padStart(2, "0")}`,
      text,
      repeats,
      occurrences,
      chars,
      risks,
      recommendation: recommendationFor(risks, occurrences),
      cacheHint: cacheHintFor(occurrences),
    });
  }

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    files: documents.map((document) => document.id),
    warnings: [],
    candidates,
    riskFindings,
    similarCandidates: includeSimilar
      ? findSimilarCandidates(
          segmentGroups.filter((group) => group.chars >= minChars),
          similarityThreshold,
        )
      : [],
  };
}

export async function auditRules(paths: string[], options: AuditOptions = {}): Promise<AuditReport> {
  const documents = await Promise.all(paths.map(async (path) => ({ id: path, text: await readFile(path, "utf8") })));
  return auditDocuments(documents, options);
}
