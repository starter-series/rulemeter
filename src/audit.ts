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

export interface RiskSummaryExample {
  text: string;
  occurrences: Occurrence[];
  chars: number;
  risks: RiskLabel[];
}

export interface RiskSummary {
  id: string;
  risk: RiskLabel;
  findings: number;
  occurrences: number;
  paths: string[];
  cacheHint: CacheHint;
  examples: RiskSummaryExample[];
}

export type SurfaceOverlapRecommendation = "keep_explicit" | "review_duplicate";

export interface SurfaceOverlapExample {
  text: string;
  occurrences: Occurrence[];
  chars: number;
  risks: RiskLabel[];
}

export interface SurfaceOverlap {
  id: string;
  paths: string[];
  duplicateTexts: number;
  occurrences: number;
  risks: RiskLabel[];
  recommendation: SurfaceOverlapRecommendation;
  cacheHint: CacheHint;
  examples: SurfaceOverlapExample[];
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
  surfaceOverlaps: SurfaceOverlap[];
  riskFindings: RiskFinding[];
  riskSummaries: RiskSummary[];
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
  let startIndex = 0;
  if ((lines[0] ?? "").trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      const closing = (lines[index] ?? "").trim();
      if (closing === "---" || closing === "...") {
        // Only treat the block as YAML frontmatter when it contains a
        // key-like line; a leading thematic break must not swallow rules.
        const block = lines.slice(1, index);
        if (block.some((blockLine) => /^[\w-]+\s*:/u.test((blockLine ?? "").trim()))) startIndex = index + 1;
        break;
      }
    }
  }
  for (let index = startIndex; index < lines.length; index += 1) {
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

function pathsFor(occurrences: Occurrence[]): string[] {
  return [...new Set(occurrences.map((occurrence) => occurrence.path))].sort((left, right) => left.localeCompare(right));
}

function hasCrossFileRepeat(occurrences: Occurrence[]): boolean {
  return pathsFor(occurrences).length > 1;
}

function sameFileRepeatOccurrences(occurrences: Occurrence[]): Occurrence[] {
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) counts.set(occurrence.path, (counts.get(occurrence.path) ?? 0) + 1);
  return occurrences.filter((occurrence) => (counts.get(occurrence.path) ?? 0) > 1);
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

function findRiskSummaries(findings: RiskFinding[]): RiskSummary[] {
  const byRisk = new Map<RiskLabel, RiskSummaryExample[]>();
  for (const finding of findings) {
    for (const risk of finding.risks) {
      const examples = byRisk.get(risk) ?? [];
      examples.push({
        text: finding.text,
        occurrences: finding.occurrences,
        chars: finding.chars,
        risks: finding.risks,
      });
      byRisk.set(risk, examples);
    }
  }

  return [...byRisk.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([risk, examples], index) => {
      const occurrences = examples.flatMap((example) => example.occurrences);
      return {
        id: `RISK_${String(index + 1).padStart(2, "0")}`,
        risk,
        findings: examples.length,
        occurrences: occurrences.length,
        paths: pathsFor(occurrences),
        cacheHint: cacheHintFor(occurrences),
        examples: examples.sort((left, right) => right.occurrences.length - left.occurrences.length || left.text.localeCompare(right.text)),
      };
    });
}

function findSurfaceOverlaps(groups: SegmentGroup[], minChars: number, minRepeats: number): SurfaceOverlap[] {
  const overlapsByPathSet = new Map<
    string,
    {
      paths: string[];
      examples: SurfaceOverlapExample[];
      occurrences: Occurrence[];
      risks: RiskLabel[];
    }
  >();

  for (const group of groups) {
    if (group.chars < minChars || group.occurrences.length < minRepeats || !hasCrossFileRepeat(group.occurrences)) continue;
    const paths = pathsFor(group.occurrences);
    const key = paths.join("\0");
    const risks = classifyRisks(group.text);
    const overlap = overlapsByPathSet.get(key) ?? { paths, examples: [], occurrences: [], risks: [] };
    overlap.examples.push({
      text: group.text,
      occurrences: group.occurrences,
      chars: group.chars,
      risks,
    });
    overlap.occurrences.push(...group.occurrences);
    overlap.risks = uniqueRisks([...overlap.risks, ...risks]);
    overlapsByPathSet.set(key, overlap);
  }

  return [...overlapsByPathSet.values()]
    .sort((left, right) => right.examples.length - left.examples.length || left.paths.join("\0").localeCompare(right.paths.join("\0")))
    .map((overlap, index) => ({
      id: `SURF_${String(index + 1).padStart(2, "0")}`,
      paths: overlap.paths,
      duplicateTexts: overlap.examples.length,
      occurrences: overlap.occurrences.length,
      risks: overlap.risks,
      recommendation: isHighRisk(overlap.risks) ? "keep_explicit" : "review_duplicate",
      cacheHint: cacheHintFor(overlap.occurrences),
      examples: overlap.examples.sort((left, right) => right.occurrences.length - left.occurrences.length || left.text.localeCompare(right.text)),
    }));
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
  const riskSummaries = findRiskSummaries(riskFindings);
  const surfaceOverlaps = findSurfaceOverlaps(segmentGroups, minChars, minRepeats);

  const candidates: RuleCandidate[] = [];
  for (const { text, occurrences, chars } of segmentGroups) {
    const candidateOccurrences = sameFileRepeatOccurrences(occurrences);
    const repeats = candidateOccurrences.length;
    if (chars < minChars || repeats < minRepeats) continue;
    const risks = classifyRisks(text);

    candidates.push({
      id: `DUP_${String(candidates.length + 1).padStart(2, "0")}`,
      text,
      repeats,
      occurrences: candidateOccurrences,
      chars,
      risks,
      recommendation: recommendationFor(risks, candidateOccurrences),
      cacheHint: cacheHintFor(candidateOccurrences),
    });
  }

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    files: documents.map((document) => document.id),
    warnings: [],
    candidates,
    surfaceOverlaps,
    riskFindings,
    riskSummaries,
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
