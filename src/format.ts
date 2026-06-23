import type { AuditReport, RuleCandidate } from "./audit.js";

function riskText(candidate: RuleCandidate): string {
  return candidate.risks.length > 0 ? candidate.risks.join(",") : "low";
}

function locationsText(candidate: RuleCandidate): string {
  const first = candidate.occurrences.slice(0, 3).map((occurrence) => `${occurrence.path}:${occurrence.line}`);
  if (candidate.occurrences.length > 3) first.push(`+${candidate.occurrences.length - 3} more`);
  return first.join(", ");
}

export function formatAuditTable(report: AuditReport): string {
  const lines: string[] = [`tokenizer: ${report.tokenizer}`];
  if (report.candidates.length === 0) {
    lines.push("No alias candidates met the thresholds.");
    return lines.join("\n");
  }

  const headers = [
    "rule",
    "repeats",
    "raw",
    "alias",
    "legend",
    "saved",
    "breakeven",
    "risk",
    "recommendation",
    "cache_hint",
    "locations",
  ];
  const rows = report.candidates.map((candidate) => [
    candidate.rule,
    String(candidate.repeats),
    String(candidate.rawTokens),
    String(candidate.aliasTokens),
    String(candidate.legendTokens),
    String(candidate.savedTokens),
    candidate.breakeven === null ? "never" : String(candidate.breakeven),
    riskText(candidate),
    candidate.recommendation,
    candidate.cacheHint,
    locationsText(candidate),
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));

  lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
  }
  return lines.join("\n");
}

