import type { AuditReport, RiskFinding, RuleCandidate, SimilarRuleCandidate } from "./audit.js";

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

function findingLocationsText(finding: RiskFinding): string {
  const first = finding.occurrences.slice(0, 3).map((occurrence) => `${occurrence.path}:${occurrence.line}`);
  if (finding.occurrences.length > 3) first.push(`+${finding.occurrences.length - 3} more`);
  return first.join(", ");
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

export function formatAuditTable(report: AuditReport): string {
  const lines: string[] = [`tokenizer: ${report.tokenizer}`];
  if (report.configPath) lines.push(`config: ${report.configPath}`);
  if (report.preset) lines.push(`preset: ${report.preset}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`discovered_files: ${report.discoveredFiles.join(", ")}`);
  }
  for (const warning of report.warnings) {
    lines.push(`warning: ${warning.code} - ${warning.message}`);
  }
  if (report.candidates.length === 0) {
    lines.push("No exact duplicate candidates met the thresholds.");
  } else {
    const headers = [
      "rule",
      "repeats",
      "raw",
      "alias",
      "legend",
      "saved",
      "dedupe_saved",
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
      String(candidate.duplicateSavedTokens),
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
  }

  if (report.riskFindings.length > 0) {
    lines.push("");
    lines.push("Risk findings:");
    const headers = ["risk", "tokens", "cache_hint", "locations", "text"];
    const rows = report.riskFindings.map((finding) => [
      finding.risks.join(","),
      String(finding.rawTokens),
      finding.cacheHint,
      findingLocationsText(finding),
      finding.text,
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
  const headers = ["rule", "similarity", "risk", "recommendation", "locations", "texts"];
  const rows = report.similarCandidates.map((candidate) => [
    candidate.rule,
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
  lines.push(`- tokenizer: \`${report.tokenizer}\``);
  if (report.configPath) lines.push(`- config: \`${report.configPath}\``);
  if (report.preset) lines.push(`- preset: \`${report.preset}\``);
  lines.push(`- files: ${report.files.length}`);
  lines.push(`- candidates: ${report.candidates.length}`);
  lines.push(`- risk findings: ${report.riskFindings.length}`);
  lines.push(`- similar candidates: ${report.similarCandidates.length}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`- discovered files: ${report.discoveredFiles.map((file) => `\`${file}\``).join(", ")}`);
  }
  for (const warning of report.warnings) {
    lines.push(`- warning: \`${warning.code}\` ${warning.message}`);
  }
  lines.push("");

  if (report.candidates.length === 0) {
    lines.push("No exact duplicate candidates met the thresholds.");
  } else {
    lines.push("| Rule | Recommendation | Risk | Repeats | Saved | Dedupe saved | Locations | Text |");
    lines.push("|---|---|---|---:|---:|---:|---|---|");
    for (const candidate of report.candidates) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.rule)}\``,
          `\`${escapeMarkdown(candidate.recommendation)}\``,
          escapeMarkdown(riskText(candidate)),
          String(candidate.repeats),
          String(candidate.savedTokens),
          String(candidate.duplicateSavedTokens),
          escapeMarkdown(locationsText(candidate)),
          escapeMarkdown(candidate.text),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.riskFindings.length > 0) {
    lines.push("");
    lines.push("## Risk Findings");
    lines.push("");
    lines.push("| Risk | Tokens | Cache hint | Locations | Text |");
    lines.push("|---|---:|---|---|---|");
    for (const finding of report.riskFindings) {
      lines.push(
        `| ${[
          escapeMarkdown(finding.risks.join(",")),
          String(finding.rawTokens),
          `\`${escapeMarkdown(finding.cacheHint)}\``,
          escapeMarkdown(findingLocationsText(finding)),
          escapeMarkdown(finding.text),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.similarCandidates.length > 0) {
    lines.push("");
    lines.push("## Similar Rule Candidates");
    lines.push("");
    lines.push("| Rule | Recommendation | Similarity | Risk | Locations | Texts |");
    lines.push("|---|---|---:|---|---|---|");
    for (const candidate of report.similarCandidates) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.rule)}\``,
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
