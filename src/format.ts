import type { AuditReport, RiskSummary, RuleCandidate, SimilarRuleCandidate, SurfaceOverlap } from "./audit.js";

function riskText(candidate: RuleCandidate): string {
  return candidate.risks.length > 0 ? candidate.risks.join(",") : "low";
}

function locationsText(candidate: RuleCandidate): string {
  const first = candidate.occurrences.slice(0, 3).map((occurrence) => `${occurrence.path}:${occurrence.line}`);
  if (candidate.occurrences.length > 3) first.push(`+${candidate.occurrences.length - 3} more`);
  return first.join(", ");
}

function similarLocationsText(candidate: SimilarRuleCandidate): string {
  return candidate.occurrences.map((occurrence) => `${occurrence.path}:${occurrence.line}`).join(", ");
}

function pathsText(paths: string[]): string {
  const first = paths.slice(0, 3);
  if (paths.length > 3) first.push(`+${paths.length - 3} more`);
  return first.join(", ");
}

function riskSummaryExamplesText(summary: RiskSummary): string {
  return summary.examples
    .slice(0, 2)
    .map((example) => previewText(example.text))
    .join(" | ");
}

function overlapExamplesText(overlap: SurfaceOverlap): string {
  return overlap.examples
    .slice(0, 2)
    .map((example) => previewText(example.text))
    .join(" | ");
}

function overlapRiskText(overlap: SurfaceOverlap): string {
  return overlap.risks.length > 0 ? overlap.risks.join(",") : "low";
}

function previewText(value: string): string {
  return value.length > 100 ? `${value.slice(0, 97)}...` : value;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

export function formatAuditTable(report: AuditReport): string {
  const lines: string[] = [];
  if (report.configPath) lines.push(`config: ${report.configPath}`);
  if (report.preset) lines.push(`preset: ${report.preset}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`discovered_files: ${report.discoveredFiles.join(", ")}`);
  }
  for (const warning of report.warnings) {
    lines.push(`warning: ${warning.code} - ${warning.message}`);
  }
  if (report.candidates.length === 0) {
    lines.push("No same-file duplicate candidates met the thresholds.");
  } else {
    lines.push("Duplicate candidates:");
    const headers = ["id", "repeats", "chars", "risk", "recommendation", "cache_hint", "locations", "text"];
    const rows = report.candidates.map((candidate) => [
      candidate.id,
      String(candidate.repeats),
      String(candidate.chars),
      riskText(candidate),
      candidate.recommendation,
      candidate.cacheHint,
      locationsText(candidate),
      candidate.text,
    ]);
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));

    lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
    lines.push(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of rows) {
      lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
    }
  }

  if (report.surfaceOverlaps.length > 0) {
    lines.push("");
    lines.push("Surface overlaps:");
    const headers = ["id", "paths", "duplicate_texts", "occurrences", "risk", "recommendation", "examples"];
    const rows = report.surfaceOverlaps.map((overlap) => [
      overlap.id,
      pathsText(overlap.paths),
      String(overlap.duplicateTexts),
      String(overlap.occurrences),
      overlapRiskText(overlap),
      overlap.recommendation,
      overlapExamplesText(overlap),
    ]);
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
    lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
    lines.push(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of rows) {
      lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
    }
  }

  if (report.riskFindings.length > 0) {
    lines.push("");
    lines.push("Risk summaries:");
    const headers = ["id", "risk", "findings", "occurrences", "paths", "cache_hint", "examples"];
    const rows = report.riskSummaries.map((summary) => [
      summary.id,
      summary.risk,
      String(summary.findings),
      String(summary.occurrences),
      pathsText(summary.paths),
      summary.cacheHint,
      riskSummaryExamplesText(summary),
    ]);
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
    lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
    lines.push(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of rows) {
      lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
    }
  }

  if (report.similarCandidates.length === 0) {
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Similar rule candidates:");
  const headers = ["id", "similarity", "risk", "recommendation", "locations", "texts"];
  const rows = report.similarCandidates.map((candidate) => [
    candidate.id,
    String(candidate.similarity),
    candidate.risks.length > 0 ? candidate.risks.join(",") : "low",
    candidate.recommendation,
    similarLocationsText(candidate),
    candidate.texts.join(" | "),
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
  }
  return lines.join("\n");
}

export function formatAuditMarkdown(report: AuditReport): string {
  const lines: string[] = ["# RuleMeter Report", ""];
  if (report.configPath) lines.push(`- config: \`${report.configPath}\``);
  if (report.preset) lines.push(`- preset: \`${report.preset}\``);
  lines.push(`- files: ${report.files.length}`);
  lines.push(`- duplicate candidates: ${report.candidates.length}`);
  lines.push(`- surface overlaps: ${report.surfaceOverlaps.length}`);
  lines.push(`- risk findings: ${report.riskFindings.length}`);
  lines.push(`- risk summaries: ${report.riskSummaries.length}`);
  lines.push(`- similar candidates: ${report.similarCandidates.length}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`- discovered files: ${report.discoveredFiles.map((file) => `\`${file}\``).join(", ")}`);
  }
  for (const warning of report.warnings) {
    lines.push(`- warning: \`${warning.code}\` ${warning.message}`);
  }
  lines.push("");

  if (report.candidates.length === 0) {
    lines.push("No same-file duplicate candidates met the thresholds.");
  } else {
    lines.push("## Duplicate Candidates");
    lines.push("");
    lines.push("| ID | Recommendation | Risk | Repeats | Chars | Locations | Text |");
    lines.push("|---|---|---|---:|---:|---|---|");
    for (const candidate of report.candidates) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.id)}\``,
          `\`${escapeMarkdown(candidate.recommendation)}\``,
          escapeMarkdown(riskText(candidate)),
          String(candidate.repeats),
          String(candidate.chars),
          escapeMarkdown(locationsText(candidate)),
          escapeMarkdown(candidate.text),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.surfaceOverlaps.length > 0) {
    lines.push("");
    lines.push("## Surface Overlaps");
    lines.push("");
    lines.push("| ID | Recommendation | Risk | Paths | Duplicate texts | Occurrences | Examples |");
    lines.push("|---|---|---|---|---:|---:|---|");
    for (const overlap of report.surfaceOverlaps) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(overlap.id)}\``,
          `\`${escapeMarkdown(overlap.recommendation)}\``,
          escapeMarkdown(overlapRiskText(overlap)),
          escapeMarkdown(pathsText(overlap.paths)),
          String(overlap.duplicateTexts),
          String(overlap.occurrences),
          escapeMarkdown(overlapExamplesText(overlap)),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.riskFindings.length > 0) {
    lines.push("");
    lines.push("## Risk Summaries");
    lines.push("");
    lines.push("| ID | Risk | Findings | Occurrences | Paths | Cache hint | Examples |");
    lines.push("|---|---|---:|---:|---|---|---|");
    for (const summary of report.riskSummaries) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(summary.id)}\``,
          escapeMarkdown(summary.risk),
          String(summary.findings),
          String(summary.occurrences),
          escapeMarkdown(pathsText(summary.paths)),
          `\`${escapeMarkdown(summary.cacheHint)}\``,
          escapeMarkdown(riskSummaryExamplesText(summary)),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.similarCandidates.length > 0) {
    lines.push("");
    lines.push("## Similar Rule Candidates");
    lines.push("");
    lines.push("| ID | Recommendation | Similarity | Risk | Locations | Texts |");
    lines.push("|---|---|---:|---|---|---|");
    for (const candidate of report.similarCandidates) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.id)}\``,
          `\`${escapeMarkdown(candidate.recommendation)}\``,
          String(candidate.similarity),
          escapeMarkdown(candidate.risks.length > 0 ? candidate.risks.join(",") : "low"),
          escapeMarkdown(similarLocationsText(candidate)),
          candidate.texts.map(escapeMarkdown).join("<br>"),
        ].join(" | ")} |`,
      );
    }
  }
  return lines.join("\n");
}
