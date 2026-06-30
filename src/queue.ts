import type { AuditReport, Occurrence, RiskSummary, RuleCandidate, SimilarRuleCandidate, SurfaceOverlap } from "./audit.js";
import type { DecisionItem, DecisionReport } from "./decisions.js";
import { QUEUE_SCHEMA_VERSION } from "./schema.js";

export type QueueItemKind = "decision" | "duplicate" | "surface_overlap" | "risk_summary" | "similar";
export type QueuePriority = "review" | "hint";

export interface QueueItem {
  id: string;
  kind: QueueItemKind;
  priority: QueuePriority;
  sourceId: string;
  signal: string;
  action: string;
  message: string;
  paths: string[];
  locations: string[];
  preview: string | null;
}

export interface QueueReport {
  schemaVersion: typeof QUEUE_SCHEMA_VERSION;
  auditSchemaVersion: AuditReport["schemaVersion"];
  decisionSchemaVersion: DecisionReport["schemaVersion"];
  files: string[];
  configPath?: string | null;
  discoveredFiles?: string[];
  preset?: string | null;
  ledgerPath: string;
  counts: {
    total: number;
    review: number;
    hint: number;
    byKind: Record<QueueItemKind, number>;
  };
  items: QueueItem[];
}

function pathsForOccurrences(occurrences: Occurrence[]): string[] {
  return [...new Set(occurrences.map((occurrence) => occurrence.path))].sort((left, right) => left.localeCompare(right));
}

function locationsFor(occurrences: Occurrence[], limit = 4): string[] {
  const locations = occurrences.slice(0, limit).map((occurrence) => `${occurrence.path}:${occurrence.line}`);
  if (occurrences.length > limit) locations.push(`+${occurrences.length - limit} more`);
  return locations;
}

function preview(value: string): string {
  return value.length > 110 ? `${value.slice(0, 107)}...` : value;
}

function duplicateAction(candidate: RuleCandidate): string {
  return candidate.recommendation === "remove_duplicate" ? "review removal" : "review explicit repeat";
}

function duplicateMessage(candidate: RuleCandidate): string {
  if (candidate.recommendation === "remove_duplicate") {
    return "Same-file exact duplicate may be removable after review.";
  }
  return "Same-file exact duplicate matched a risk label; keep-explicit wording should be reviewed deliberately.";
}

function surfaceAction(overlap: SurfaceOverlap): string {
  return overlap.recommendation === "keep_explicit" ? "review explicit overlap" : "review parity";
}

function surfaceMessage(overlap: SurfaceOverlap): string {
  if (overlap.recommendation === "keep_explicit") {
    return "Cross-file exact overlap matched a risk label; review parity without treating it as a deletion instruction.";
  }
  return "Cross-file exact overlap may need parity or consolidation review.";
}

function similarAction(candidate: SimilarRuleCandidate): string {
  return candidate.recommendation === "keep_explicit" ? "review explicit similarity" : "review lexical similarity";
}

function riskMessage(summary: RiskSummary): string {
  return `Keyword review hint for ${summary.risk.replaceAll("_", " ")}; non-exhaustive and not a safety guarantee.`;
}

function decisionQueueItems(report: DecisionReport): QueueItem[] {
  return report.items
    .filter((item) => item.status === "pending" || item.status === "stale")
    .map((item) => ({
      id: `QUEUE_${item.id}`,
      kind: "decision" as const,
      priority: "review" as const,
      sourceId: item.id,
      signal: item.signal,
      action: item.status === "stale" ? "re-ratify topology" : "ratify topology",
      message: item.message,
      paths: [item.subject, ...(item.target ? [item.target] : [])],
      locations: [item.subject],
      preview: item.status,
    }));
}

function duplicateQueueItems(report: AuditReport): QueueItem[] {
  return report.candidates.map((candidate) => ({
    id: `QUEUE_${candidate.id}`,
    kind: "duplicate" as const,
    priority: "review" as const,
    sourceId: candidate.id,
    signal: candidate.recommendation,
    action: duplicateAction(candidate),
    message: duplicateMessage(candidate),
    paths: pathsForOccurrences(candidate.occurrences),
    locations: locationsFor(candidate.occurrences),
    preview: preview(candidate.text),
  }));
}

function surfaceQueueItems(report: AuditReport): QueueItem[] {
  return report.surfaceOverlaps.map((overlap) => ({
    id: `QUEUE_${overlap.id}`,
    kind: "surface_overlap" as const,
    priority: "review" as const,
    sourceId: overlap.id,
    signal: overlap.recommendation,
    action: surfaceAction(overlap),
    message: surfaceMessage(overlap),
    paths: overlap.paths,
    locations: locationsFor(overlap.examples.flatMap((example) => example.occurrences)),
    preview: overlap.examples[0] ? preview(overlap.examples[0].text) : null,
  }));
}

function similarQueueItems(report: AuditReport): QueueItem[] {
  return report.similarCandidates.map((candidate) => ({
    id: `QUEUE_${candidate.id}`,
    kind: "similar" as const,
    priority: "review" as const,
    sourceId: candidate.id,
    signal: candidate.recommendation,
    action: similarAction(candidate),
    message: "Lexical similarity candidate; review wording overlap without treating it as semantic equivalence.",
    paths: pathsForOccurrences(candidate.occurrences),
    locations: locationsFor(candidate.occurrences),
    preview: candidate.texts.map(preview).join(" | "),
  }));
}

function riskQueueItems(report: AuditReport): QueueItem[] {
  return report.riskSummaries.map((summary) => ({
    id: `QUEUE_${summary.id}`,
    kind: "risk_summary" as const,
    priority: "hint" as const,
    sourceId: summary.id,
    signal: summary.risk,
    action: "review keyword hint",
    message: riskMessage(summary),
    paths: summary.paths,
    locations: locationsFor(summary.examples.flatMap((example) => example.occurrences)),
    preview: summary.examples[0] ? preview(summary.examples[0].text) : null,
  }));
}

function queueSortRank(item: QueueItem): number {
  if (item.kind === "decision") return 0;
  if (item.kind === "duplicate") return 1;
  if (item.kind === "surface_overlap") return 2;
  if (item.kind === "similar") return 3;
  return 4;
}

export function buildReviewQueue(auditReport: AuditReport, decisionReport: DecisionReport): QueueReport {
  const items = [
    ...decisionQueueItems(decisionReport),
    ...duplicateQueueItems(auditReport),
    ...surfaceQueueItems(auditReport),
    ...similarQueueItems(auditReport),
    ...riskQueueItems(auditReport),
  ].sort((left, right) => queueSortRank(left) - queueSortRank(right) || left.id.localeCompare(right.id));

  const byKind: Record<QueueItemKind, number> = {
    decision: items.filter((item) => item.kind === "decision").length,
    duplicate: items.filter((item) => item.kind === "duplicate").length,
    surface_overlap: items.filter((item) => item.kind === "surface_overlap").length,
    risk_summary: items.filter((item) => item.kind === "risk_summary").length,
    similar: items.filter((item) => item.kind === "similar").length,
  };

  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    auditSchemaVersion: auditReport.schemaVersion,
    decisionSchemaVersion: decisionReport.schemaVersion,
    files: auditReport.files,
    configPath: auditReport.configPath,
    preset: auditReport.preset,
    discoveredFiles: auditReport.discoveredFiles,
    ledgerPath: decisionReport.ledgerPath,
    counts: {
      total: items.length,
      review: items.filter((item) => item.priority === "review").length,
      hint: items.filter((item) => item.priority === "hint").length,
      byKind,
    },
    items,
  };
}
