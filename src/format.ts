import type { AuditReport, RiskSummary, RuleCandidate, SimilarRuleCandidate, SurfaceOverlap } from "./audit.js";
import type { DecisionReport } from "./decisions.js";
import type { QueueReport } from "./queue.js";
import type { SourceReport } from "./sources.js";

function riskText(candidate: RuleCandidate): string {
  return candidate.risks.length > 0 ? candidate.risks.map(labelText).join(", ") : "none";
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
  return overlap.risks.length > 0 ? overlap.risks.map(labelText).join(", ") : "none";
}

function previewText(value: string): string {
  return value.length > 88 ? `${value.slice(0, 85)}...` : value;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function labelText(value: string): string {
  return value.replaceAll("_", " ");
}

function duplicateActionText(candidate: RuleCandidate): string {
  return candidate.recommendation === "remove_duplicate" ? "Probably removable" : "Keep explicit";
}

function overlapActionText(overlap: SurfaceOverlap): string {
  return overlap.recommendation === "keep_explicit" ? "Keep explicit in each surface" : "Review for parity or consolidation";
}

function similarActionText(candidate: SimilarRuleCandidate): string {
  return candidate.recommendation === "keep_explicit" ? "Keep explicit" : "Review lexical overlap";
}

function duplicateActionRank(candidate: RuleCandidate): number {
  return candidate.recommendation === "remove_duplicate" ? 0 : 1;
}

function candidateDisplayOrder(candidates: RuleCandidate[]): RuleCandidate[] {
  return [...candidates].sort(
    (left, right) => duplicateActionRank(left) - duplicateActionRank(right) || left.id.localeCompare(right.id),
  );
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
    lines.push("No same-file duplicate actions met the thresholds.");
  } else {
    lines.push("Same-file duplicate actions:");
    const headers = ["id", "action", "repeats", "risk", "locations", "text"];
    const rows = candidateDisplayOrder(report.candidates).map((candidate) => [
      candidate.id,
      duplicateActionText(candidate),
      String(candidate.repeats),
      riskText(candidate),
      locationsText(candidate),
      previewText(candidate.text),
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
    lines.push("Cross-file overlap reviews:");
    const headers = ["id", "action", "paths", "shared rules", "occurrences", "risk", "examples"];
    const rows = report.surfaceOverlaps.map((overlap) => [
      overlap.id,
      overlapActionText(overlap),
      pathsText(overlap.paths),
      String(overlap.duplicateTexts),
      String(overlap.occurrences),
      overlapRiskText(overlap),
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
    lines.push("Keyword review hits:");
    const headers = ["id", "label", "findings", "occurrences", "paths", "examples"];
    const rows = report.riskSummaries.map((summary) => [
      summary.id,
      labelText(summary.risk),
      String(summary.findings),
      String(summary.occurrences),
      pathsText(summary.paths),
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
  lines.push("Lexical similarity reviews:");
  const headers = ["id", "action", "similarity", "risk", "locations", "texts"];
  const rows = report.similarCandidates.map((candidate) => [
    candidate.id,
    similarActionText(candidate),
    String(candidate.similarity),
    candidate.risks.length > 0 ? candidate.risks.map(labelText).join(", ") : "none",
    similarLocationsText(candidate),
    candidate.texts.map(previewText).join(" | "),
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
  lines.push(`- same-file duplicate actions: ${report.candidates.length}`);
  lines.push(`- cross-file overlap reviews: ${report.surfaceOverlaps.length}`);
  lines.push(`- keyword review findings: ${report.riskFindings.length}`);
  lines.push(`- keyword review groups: ${report.riskSummaries.length}`);
  lines.push(`- lexical similarity reviews: ${report.similarCandidates.length}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`- discovered files: ${report.discoveredFiles.map((file) => `\`${file}\``).join(", ")}`);
  }
  for (const warning of report.warnings) {
    lines.push(`- warning: \`${warning.code}\` ${warning.message}`);
  }
  lines.push("");

  if (report.candidates.length === 0) {
    lines.push("No same-file duplicate actions met the thresholds.");
  } else {
    lines.push("## Same-file Duplicate Actions");
    lines.push("");
    lines.push("| ID | Action | Risk | Repeats | Locations | Text |");
    lines.push("|---|---|---|---:|---|---|");
    for (const candidate of candidateDisplayOrder(report.candidates)) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.id)}\``,
          escapeMarkdown(duplicateActionText(candidate)),
          escapeMarkdown(riskText(candidate)),
          String(candidate.repeats),
          escapeMarkdown(locationsText(candidate)),
          escapeMarkdown(previewText(candidate.text)),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.surfaceOverlaps.length > 0) {
    lines.push("");
    lines.push("## Cross-file Overlap Reviews");
    lines.push("");
    lines.push("| ID | Action | Risk | Paths | Shared rules | Occurrences | Examples |");
    lines.push("|---|---|---|---|---:|---:|---|");
    for (const overlap of report.surfaceOverlaps) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(overlap.id)}\``,
          escapeMarkdown(overlapActionText(overlap)),
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
    lines.push("## Keyword Review Hits");
    lines.push("");
    lines.push("| ID | Label | Findings | Occurrences | Paths | Examples |");
    lines.push("|---|---|---:|---:|---|---|");
    for (const summary of report.riskSummaries) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(summary.id)}\``,
          escapeMarkdown(labelText(summary.risk)),
          String(summary.findings),
          String(summary.occurrences),
          escapeMarkdown(pathsText(summary.paths)),
          escapeMarkdown(riskSummaryExamplesText(summary)),
        ].join(" | ")} |`,
      );
    }
  }

  if (report.similarCandidates.length > 0) {
    lines.push("");
    lines.push("## Lexical Similarity Reviews");
    lines.push("");
    lines.push("| ID | Action | Similarity | Risk | Locations | Texts |");
    lines.push("|---|---|---:|---|---|---|");
    for (const candidate of report.similarCandidates) {
      lines.push(
        `| ${[
          `\`${escapeMarkdown(candidate.id)}\``,
          escapeMarkdown(similarActionText(candidate)),
          String(candidate.similarity),
          escapeMarkdown(candidate.risks.length > 0 ? candidate.risks.map(labelText).join(", ") : "none"),
          escapeMarkdown(similarLocationsText(candidate)),
          candidate.texts.map((text) => escapeMarkdown(previewText(text))).join("<br>"),
        ].join(" | ")} |`,
      );
    }
  }
  return lines.join("\n");
}

function sourceImportsText(imports: SourceReport["files"][number]["imports"]): string {
  if (imports.length === 0) return "-";
  return imports.map((reference) => `@${reference.specifier}`).join(", ");
}

function sourceSymlinkText(file: SourceReport["files"][number]): string {
  return file.symlinkTarget ?? "-";
}

function sourceRoleText(role: SourceReport["files"][number]["role"]): string {
  if (role === "canonical") return "canonical";
  if (role === "import_alias") return "imports canonical";
  if (role === "symlink_alias") return "symlink alias";
  if (role === "verbatim_mirror") return "verbatim mirror";
  return "local override";
}

function sourceVerdictLines(report: SourceReport): string[] {
  if (report.sourceStrategy === "standalone") return ["ok: one instruction source found"];
  if (report.sourceStrategy === "single_source") return ["ok: single source strategy detected"];
  const lines = report.warnings.map((warning) => `review: ${warning.message}`);
  return lines.length > 0 ? lines : ["review: source strategy is unresolved"];
}

export function formatSourcesTable(report: SourceReport): string {
  const lines: string[] = [];
  if (report.preset) lines.push(`preset: ${report.preset}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`discovered_files: ${report.discoveredFiles.join(", ")}`);
  }
  lines.push("Instruction source topology:");
  const headers = ["path", "role", "symlink", "imports", "evidence"];
  const rows = report.files.map((file) => [file.path, sourceRoleText(file.role), sourceSymlinkText(file), sourceImportsText(file.imports), file.evidence]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
  }
  lines.push("", "Verdict:");
  for (const verdict of sourceVerdictLines(report)) lines.push(`- ${verdict}`);
  return lines.join("\n");
}

export function formatSourcesMarkdown(report: SourceReport): string {
  const lines: string[] = ["# RuleMeter Source Topology", ""];
  if (report.preset) lines.push(`- preset: \`${report.preset}\``);
  lines.push(`- files: ${report.files.length}`);
  lines.push(`- canonical: ${report.canonicalPath ? `\`${report.canonicalPath}\`` : "none"}`);
  lines.push(`- strategy: \`${report.sourceStrategy}\``);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`- discovered files: ${report.discoveredFiles.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("", "## Instruction Source Topology", "");
  lines.push("| Path | Role | Symlink | Imports | Evidence |");
  lines.push("|---|---|---|---|---|");
  for (const file of report.files) {
    lines.push(
        `| ${[
          `\`${escapeMarkdown(file.path)}\``,
        escapeMarkdown(sourceRoleText(file.role)),
        escapeMarkdown(sourceSymlinkText(file)),
        escapeMarkdown(sourceImportsText(file.imports)),
        escapeMarkdown(file.evidence),
      ].join(" | ")} |`,
    );
  }
  lines.push("", "## Verdict", "");
  for (const verdict of sourceVerdictLines(report)) lines.push(`- ${escapeMarkdown(verdict)}`);
  return lines.join("\n");
}

function openDecisionItems(report: DecisionReport): DecisionReport["items"] {
  return report.items.filter((item) => item.status === "pending" || item.status === "stale");
}

function decisionTargetText(target: string | null): string {
  return target ?? "-";
}

export function formatDecisionsTable(report: DecisionReport): string {
  const lines: string[] = [];
  lines.push(`ledger: ${report.ledgerPath}`);
  lines.push(`source_strategy: ${report.sourceStrategy}`);
  if (report.canonicalPath) lines.push(`canonical: ${report.canonicalPath}`);
  lines.push(
    `decisions: ${report.counts.total} total, ${report.counts.pending} pending, ${report.counts.stale} stale, ${report.counts.accepted} accepted`,
  );

  const items = openDecisionItems(report);
  if (items.length === 0) {
    lines.push("No pending or stale decision items.");
    return lines.join("\n");
  }

  lines.push("Decision review items:");
  const headers = ["id", "status", "signal", "subject", "target", "message"];
  const rows = items.map((item) => [item.id, item.status, item.signal, item.subject, decisionTargetText(item.target), item.message]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
  }
  lines.push("", "Accept current items with:");
  lines.push("rulemeter decisions --accept all");
  return lines.join("\n");
}

export function formatDecisionsMarkdown(report: DecisionReport): string {
  const lines: string[] = ["# RuleMeter Decision Ledger", ""];
  lines.push(`- ledger: \`${report.ledgerPath}\``);
  lines.push(`- source strategy: \`${report.sourceStrategy}\``);
  lines.push(`- canonical: ${report.canonicalPath ? `\`${report.canonicalPath}\`` : "none"}`);
  lines.push(`- decisions: ${report.counts.total} total`);
  lines.push(`- pending: ${report.counts.pending}`);
  lines.push(`- stale: ${report.counts.stale}`);
  lines.push(`- accepted: ${report.counts.accepted}`);

  const items = openDecisionItems(report);
  if (items.length === 0) {
    lines.push("", "No pending or stale decision items.");
    return lines.join("\n");
  }

  lines.push("", "## Decision Review Items", "");
  lines.push("| ID | Status | Signal | Subject | Target | Message |");
  lines.push("|---|---|---|---|---|---|");
  for (const item of items) {
    lines.push(
      `| ${[
        `\`${escapeMarkdown(item.id)}\``,
        escapeMarkdown(item.status),
        escapeMarkdown(item.signal),
        `\`${escapeMarkdown(item.subject)}\``,
        item.target ? `\`${escapeMarkdown(item.target)}\`` : "-",
        escapeMarkdown(item.message),
      ].join(" | ")} |`,
    );
  }
  lines.push("", "Accept current items with:");
  lines.push("");
  lines.push("```bash");
  lines.push("rulemeter decisions --accept all");
  lines.push("```");
  return lines.join("\n");
}

function queuePathsText(paths: string[]): string {
  if (paths.length === 0) return "-";
  return pathsText(paths);
}

function queueLocationsText(locations: string[]): string {
  if (locations.length === 0) return "-";
  return pathsText(locations);
}

export function formatQueueTable(report: QueueReport): string {
  const lines: string[] = [];
  if (report.configPath) lines.push(`config: ${report.configPath}`);
  if (report.preset) lines.push(`preset: ${report.preset}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`discovered_files: ${report.discoveredFiles.join(", ")}`);
  }
  lines.push(`ledger: ${report.ledgerPath}`);
  lines.push(`queue: ${report.counts.total} items, ${report.counts.review} review, ${report.counts.hint} hints`);

  if (report.items.length === 0) {
    lines.push("No open review queue items.");
    return lines.join("\n");
  }

  const headers = ["id", "priority", "kind", "action", "signal", "paths", "locations", "message"];
  const rows = report.items.map((item) => [
    item.id,
    item.priority,
    item.kind,
    item.action,
    item.signal,
    queuePathsText(item.paths),
    queueLocationsText(item.locations),
    item.message,
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  lines.push("Review queue:");
  lines.push(headers.map((header, index) => header.padEnd(widths[index] ?? header.length)).join("  "));
  lines.push(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    lines.push(row.map((value, index) => value.padEnd(widths[index] ?? value.length)).join("  "));
  }
  return lines.join("\n");
}

export function formatQueueMarkdown(report: QueueReport): string {
  const lines: string[] = ["# RuleMeter Review Queue", ""];
  if (report.configPath) lines.push(`- config: \`${report.configPath}\``);
  if (report.preset) lines.push(`- preset: \`${report.preset}\``);
  lines.push(`- files: ${report.files.length}`);
  lines.push(`- ledger: \`${report.ledgerPath}\``);
  lines.push(`- total items: ${report.counts.total}`);
  lines.push(`- review items: ${report.counts.review}`);
  lines.push(`- hints: ${report.counts.hint}`);
  lines.push(`- decision items: ${report.counts.byKind.decision}`);
  lines.push(`- duplicate items: ${report.counts.byKind.duplicate}`);
  lines.push(`- surface-overlap items: ${report.counts.byKind.surface_overlap}`);
  lines.push(`- similar items: ${report.counts.byKind.similar}`);
  lines.push(`- keyword hint items: ${report.counts.byKind.risk_summary}`);
  if (report.discoveredFiles && report.discoveredFiles.length > 0) {
    lines.push(`- discovered files: ${report.discoveredFiles.map((file) => `\`${file}\``).join(", ")}`);
  }

  if (report.items.length === 0) {
    lines.push("", "No open review queue items.");
    return lines.join("\n");
  }

  lines.push("", "## Queue Items", "");
  lines.push("| ID | Priority | Kind | Action | Signal | Paths | Locations | Message |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const item of report.items) {
    lines.push(
      `| ${[
        `\`${escapeMarkdown(item.id)}\``,
        escapeMarkdown(item.priority),
        escapeMarkdown(item.kind),
        escapeMarkdown(item.action),
        escapeMarkdown(item.signal),
        escapeMarkdown(queuePathsText(item.paths)),
        escapeMarkdown(queueLocationsText(item.locations)),
        escapeMarkdown(item.message),
      ].join(" | ")} |`,
    );
  }
  return lines.join("\n");
}
