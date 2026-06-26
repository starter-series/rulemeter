#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { auditDocuments } from "../dist/index.js";

const VALID_FORMATS = new Set(["json", "markdown"]);
const VALID_SPLITS = new Set(["calibration", "holdout"]);
const VALID_DECISIONS = new Set(["actionable", "noise", "unsafe", "missed", "unreviewed"]);
const DEFAULT_THRESHOLDS = {
  minDocuments: 20,
  minRoots: 4,
  maxReviewItemsPerKloc: 20,
  maxRiskFindingsPerKloc: 20,
  minDuplicateUsefulRate: 0.8,
  minSurfaceOverlapUsefulRate: 0.6,
  minRiskUsefulRate: 0.6,
};

function usage() {
  return `Usage
  node scripts/validate-corpus.mjs --manifest PATH [--format json|markdown] [--out PATH] [--include-text] [--experimental-similar] [--strict]

The manifest points to real local instruction files. Corpus contents are not committed by this script.`;
}

class UsageError extends Error {}

function takeValue(args, flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new UsageError(`${flag} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeBool(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function parseArgs(argv) {
  const args = [...argv];
  if (takeBool(args, "--help") || takeBool(args, "-h")) return { help: true };
  const manifest = takeValue(args, "--manifest", "validation/corpus.json");
  const format = takeValue(args, "--format", "json");
  if (!VALID_FORMATS.has(format)) throw new UsageError("--format must be one of: json, markdown");
  const out = takeValue(args, "--out", "");
  const includeText = takeBool(args, "--include-text");
  const includeSimilar = takeBool(args, "--experimental-similar");
  const strict = takeBool(args, "--strict");
  const similarityThreshold = Number(takeValue(args, "--similarity-threshold", "0.65"));
  if (!Number.isFinite(similarityThreshold) || similarityThreshold <= 0 || similarityThreshold > 1) {
    throw new UsageError("--similarity-threshold must be greater than 0 and at most 1");
  }
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) throw new UsageError(`unknown flag: ${unknown}`);
  return { manifest, format, out, includeText, includeSimilar, strict, similarityThreshold };
}

function fingerprint(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function labelMap(labels) {
  const map = new Map();
  if (!labels) return map;
  const entries = Array.isArray(labels) ? labels : Object.entries(labels).map(([fingerprint, value]) => ({ fingerprint, ...value }));
  for (const entry of entries) {
    if (!entry?.fingerprint) throw new UsageError("label entries require a fingerprint");
    const decision = entry.decision ?? "unreviewed";
    if (!VALID_DECISIONS.has(decision)) throw new UsageError(`invalid label decision for ${entry.fingerprint}: ${decision}`);
    map.set(entry.fingerprint, { decision, note: entry.note ?? "" });
  }
  return map;
}

function splitFor(occurrences, splitById) {
  const splits = [...new Set(occurrences.map((occurrence) => splitById.get(occurrence.path) ?? "unknown"))].sort();
  return splits.length === 1 ? splits[0] : "mixed";
}

function locationText(occurrences) {
  return occurrences.map((occurrence) => `${occurrence.path}:${occurrence.line}`).join(", ");
}

function decisionCounts(findings) {
  const counts = { actionable: 0, noise: 0, unsafe: 0, missed: 0, unreviewed: 0 };
  for (const finding of findings) counts[finding.decision] += 1;
  return counts;
}

function usefulRate(counts) {
  const reviewed = counts.actionable + counts.noise + counts.unsafe;
  return reviewed === 0 ? null : Number((counts.actionable / reviewed).toFixed(3));
}

function decorateDuplicate(candidate, splitById, labels, includeText) {
  const id = fingerprint({ kind: "duplicate", text: candidate.text, recommendation: candidate.recommendation, risks: candidate.risks });
  const label = labels.get(id) ?? { decision: "unreviewed", note: "" };
  return {
    fingerprint: id,
    kind: "duplicate",
    split: splitFor(candidate.occurrences, splitById),
    decision: label.decision,
    note: label.note,
    recommendation: candidate.recommendation,
    risks: candidate.risks,
    repeats: candidate.repeats,
    chars: candidate.chars,
    locations: candidate.occurrences,
    locationText: locationText(candidate.occurrences),
    ...(includeText ? { text: candidate.text } : {}),
  };
}

function decorateRiskSummary(summary, splitById, labels, includeText) {
  const id = fingerprint({
    kind: "risk_summary",
    risk: summary.risk,
    paths: summary.paths,
    findings: summary.findings,
  });
  const label = labels.get(id) ?? { decision: "unreviewed", note: "" };
  const occurrences = summary.examples.flatMap((example) => example.occurrences);
  return {
    fingerprint: id,
    kind: "risk_summary",
    split: splitFor(occurrences, splitById),
    decision: label.decision,
    note: label.note,
    risk: summary.risk,
    findings: summary.findings,
    occurrences: summary.occurrences,
    paths: summary.paths,
    examples: summary.examples.length,
    locationText: summary.paths.join(", "),
    ...(includeText
      ? {
          exampleTexts: summary.examples.map((example) => example.text),
        }
      : {}),
  };
}

function decorateSurfaceOverlap(overlap, splitById, labels, includeText) {
  const id = fingerprint({
    kind: "surface_overlap",
    paths: overlap.paths,
    duplicateTexts: overlap.duplicateTexts,
    recommendation: overlap.recommendation,
    risks: overlap.risks,
  });
  const label = labels.get(id) ?? { decision: "unreviewed", note: "" };
  const occurrences = overlap.examples.flatMap((example) => example.occurrences);
  return {
    fingerprint: id,
    kind: "surface_overlap",
    split: splitFor(occurrences, splitById),
    decision: label.decision,
    note: label.note,
    recommendation: overlap.recommendation,
    risks: overlap.risks,
    paths: overlap.paths,
    duplicateTexts: overlap.duplicateTexts,
    occurrences: overlap.occurrences,
    examples: overlap.examples.length,
    locationText: overlap.paths.join(", "),
    ...(includeText
      ? {
          exampleTexts: overlap.examples.map((example) => example.text),
        }
      : {}),
  };
}

function decorateSimilar(candidate, splitById, labels, includeText) {
  const texts = [...candidate.texts].sort();
  const id = fingerprint({ kind: "similar", texts, recommendation: candidate.recommendation, risks: candidate.risks });
  const label = labels.get(id) ?? { decision: "unreviewed", note: "" };
  return {
    fingerprint: id,
    kind: "similar",
    split: splitFor(candidate.occurrences, splitById),
    decision: label.decision,
    note: label.note,
    recommendation: candidate.recommendation,
    risks: candidate.risks,
    repeats: candidate.repeats,
    similarity: candidate.similarity,
    locations: candidate.occurrences,
    locationText: locationText(candidate.occurrences),
    ...(includeText ? { texts: candidate.texts } : {}),
  };
}

function perKloc(count, totalLines) {
  return totalLines === 0 ? 0 : (count / totalLines) * 1000;
}

function corpusWarnings({ documents, roots, splitCounts, findings, riskFindingCount, thresholds, totalLines, usefulRates }) {
  const warnings = [];
  if (documents.length < thresholds.minDocuments) {
    warnings.push(`corpus has ${documents.length} documents; target is at least ${thresholds.minDocuments}`);
  }
  if (roots.size < thresholds.minRoots) {
    warnings.push(`corpus has ${roots.size} roots; target is at least ${thresholds.minRoots}`);
  }
  if ((splitCounts.holdout ?? 0) === 0) warnings.push("corpus has no holdout documents");
  if (findings.every((finding) => finding.decision === "unreviewed")) warnings.push("findings have no manual labels yet");
  const reviewItemsPerKloc = perKloc(findings.length, totalLines);
  if (reviewItemsPerKloc > thresholds.maxReviewItemsPerKloc) {
    warnings.push(`review item load is ${reviewItemsPerKloc.toFixed(1)} per 1,000 lines; target is at most ${thresholds.maxReviewItemsPerKloc}`);
  }
  const riskPerKloc = perKloc(riskFindingCount, totalLines);
  if (riskPerKloc > thresholds.maxRiskFindingsPerKloc) {
    warnings.push(`risk finding load is ${riskPerKloc.toFixed(1)} per 1,000 lines; target is at most ${thresholds.maxRiskFindingsPerKloc}`);
  }
  if (usefulRates.duplicate !== null && usefulRates.duplicate < thresholds.minDuplicateUsefulRate) {
    warnings.push(`duplicate useful rate is ${usefulRates.duplicate}; target is at least ${thresholds.minDuplicateUsefulRate}`);
  }
  if (usefulRates.surfaceOverlap !== null && usefulRates.surfaceOverlap < thresholds.minSurfaceOverlapUsefulRate) {
    warnings.push(`surface overlap useful rate is ${usefulRates.surfaceOverlap}; target is at least ${thresholds.minSurfaceOverlapUsefulRate}`);
  }
  if (usefulRates.risk !== null && usefulRates.risk < thresholds.minRiskUsefulRate) {
    warnings.push(`risk useful rate is ${usefulRates.risk}; target is at least ${thresholds.minRiskUsefulRate}`);
  }
  return warnings;
}

function markdownReport(payload) {
  const lines = [
    "# RuleMeter Corpus Validation",
    "",
    `- schema: \`${payload.schemaVersion}\``,
    `- manifest: \`${payload.manifestPath}\``,
    `- documents: ${payload.corpus.documents}`,
    `- roots: ${payload.corpus.roots}`,
    `- lines: ${payload.corpus.lines}`,
    `- review item load: ${payload.metrics.reviewItemsPerKloc} per 1,000 lines`,
    `- risk finding load: ${payload.metrics.riskFindingsPerKloc} per 1,000 lines`,
    `- duplicate candidates: ${payload.metrics.byKind.duplicate}`,
    `- surface overlaps: ${payload.metrics.byKind.surfaceOverlap}`,
    `- risk findings: ${payload.metrics.byKind.risk}`,
    `- risk summaries: ${payload.metrics.byKind.riskSummary}`,
    `- similar candidates: ${payload.metrics.byKind.similar}`,
    "",
    "## Warnings",
    "",
  ];
  if (payload.warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of payload.warnings) lines.push(`- ${warning}`);
  }
  lines.push("", "## Findings", "", "| Fingerprint | Kind | Split | Decision | Signal | Locations |", "|---|---|---|---|---|---|");
  for (const finding of payload.findings) {
    const signal = finding.recommendation ?? finding.risk ?? finding.risks?.join(",") ?? "low";
    lines.push(`| \`${finding.fingerprint}\` | ${finding.kind} | ${finding.split} | ${finding.decision} | ${signal || "low"} | ${finding.locationText} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function loadManifest(path) {
  const resolved = resolve(path);
  const manifest = JSON.parse(await readFile(resolved, "utf8"));
  if (manifest.schemaVersion !== "rulemeter.validation.v1") {
    throw new UsageError("manifest schemaVersion must be rulemeter.validation.v1");
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new UsageError("manifest documents must be a non-empty array");
  }
  return { manifest, path: resolved, directory: dirname(resolved) };
}

async function buildPayload(options) {
  const loaded = await loadManifest(options.manifest);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(loaded.manifest.thresholds ?? {}) };
  const labels = labelMap(loaded.manifest.labels);
  const splitById = new Map();
  const roots = new Set();
  const splitCounts = {};
  let totalLines = 0;

  const documents = await Promise.all(
    loaded.manifest.documents.map(async (document) => {
      if (!document.path) throw new UsageError("each document requires a path");
      const split = document.split ?? "calibration";
      if (!VALID_SPLITS.has(split)) throw new UsageError(`invalid split for ${document.path}: ${split}`);
      const absolutePath = isAbsolute(document.path) ? document.path : resolve(loaded.directory, document.path);
      const text = await readFile(absolutePath, "utf8");
      const id = document.id ?? document.path;
      splitById.set(id, split);
      roots.add(document.root ?? "default");
      splitCounts[split] = (splitCounts[split] ?? 0) + 1;
      totalLines += text.split(/\r?\n/u).length;
      return { id, text };
    }),
  );

  const report = await auditDocuments(documents, {
    includeSimilar: options.includeSimilar,
    similarityThreshold: options.similarityThreshold,
  });
  const findings = [
    ...report.candidates.map((candidate) => decorateDuplicate(candidate, splitById, labels, options.includeText)),
    ...report.surfaceOverlaps.map((overlap) => decorateSurfaceOverlap(overlap, splitById, labels, options.includeText)),
    ...report.riskSummaries.map((summary) => decorateRiskSummary(summary, splitById, labels, options.includeText)),
    ...report.similarCandidates.map((candidate) => decorateSimilar(candidate, splitById, labels, options.includeText)),
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.fingerprint.localeCompare(right.fingerprint));

  const duplicateCounts = decisionCounts(findings.filter((finding) => finding.kind === "duplicate"));
  const surfaceOverlapCounts = decisionCounts(findings.filter((finding) => finding.kind === "surface_overlap"));
  const riskSummaryCounts = decisionCounts(findings.filter((finding) => finding.kind === "risk_summary"));
  const similarCounts = decisionCounts(findings.filter((finding) => finding.kind === "similar"));
  const usefulRates = {
    duplicate: usefulRate(duplicateCounts),
    surfaceOverlap: usefulRate(surfaceOverlapCounts),
    risk: usefulRate(riskSummaryCounts),
    similar: usefulRate(similarCounts),
  };
  const payload = {
    schemaVersion: "rulemeter.validation.v1",
    manifestPath: loaded.path,
    corpus: {
      documents: documents.length,
      roots: roots.size,
      lines: totalLines,
      splitCounts,
    },
    metrics: {
      reviewItemsPerKloc: Number(perKloc(findings.length, totalLines).toFixed(1)),
      riskFindingsPerKloc: Number(perKloc(report.riskFindings.length, totalLines).toFixed(1)),
      byKind: {
        duplicate: report.candidates.length,
        surfaceOverlap: report.surfaceOverlaps.length,
        risk: report.riskFindings.length,
        riskSummary: report.riskSummaries.length,
        similar: report.similarCandidates.length,
      },
      decisions: {
        duplicate: duplicateCounts,
        surfaceOverlap: surfaceOverlapCounts,
        risk: riskSummaryCounts,
        similar: similarCounts,
      },
      usefulRates: {
        duplicate: usefulRates.duplicate,
        surfaceOverlap: usefulRates.surfaceOverlap,
        risk: usefulRates.risk,
        similar: usefulRates.similar,
      },
    },
    findings,
    warnings: [],
  };
  payload.warnings = corpusWarnings({ documents, roots, splitCounts, findings, riskFindingCount: report.riskFindings.length, thresholds, totalLines, usefulRates });
  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const payload = await buildPayload(options);
  const output = options.format === "json" ? `${JSON.stringify(payload, null, 2)}\n` : markdownReport(payload);
  if (options.out) {
    await mkdir(dirname(resolve(options.out)), { recursive: true });
    await writeFile(options.out, output, "utf8");
  } else {
    process.stdout.write(output);
  }
  return options.strict && payload.warnings.length > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof UsageError ? `rulemeter validation: ${error.message}` : error);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  },
);
