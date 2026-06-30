#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { auditDocuments } from "../dist/index.js";

const VALID_FORMATS = new Set(["json", "markdown"]);
const VALID_SPLITS = new Set(["calibration", "holdout"]);
const VALID_DECISIONS = new Set(["actionable", "noise", "unsafe", "missed", "unreviewed"]);
const VALID_REQUIRED_SIGNALS = new Set(["duplicate", "surface_overlap", "risk_summary"]);
const DEFAULT_THRESHOLDS = {
  minDocuments: 20,
  minRoots: 4,
  maxReviewItemsPerKloc: 20,
  maxRiskFindingsPerKloc: 20,
  minDuplicateUsefulRate: 0.8,
  minSurfaceOverlapUsefulRate: 0.6,
  minRiskUsefulRate: 0.6,
  requiredSignals: ["duplicate", "surface_overlap", "risk_summary"],
};

const SIGNALS = {
  duplicate: {
    key: "duplicate",
    findingKind: "duplicate",
    label: "duplicate",
    threshold: "minDuplicateUsefulRate",
  },
  surfaceOverlap: {
    key: "surfaceOverlap",
    findingKind: "surface_overlap",
    label: "surface-overlap",
    threshold: "minSurfaceOverlapUsefulRate",
  },
  risk: {
    key: "risk",
    findingKind: "risk_summary",
    label: "risk-summary",
    threshold: "minRiskUsefulRate",
  },
  similar: {
    key: "similar",
    findingKind: "similar",
    label: "similar",
    threshold: null,
  },
};

function usage() {
  return `Usage
  node scripts/validate-corpus.mjs --manifest PATH [--format json|markdown] [--out PATH] [--labels PATH] [--label-template PATH] [--include-text] [--experimental-similar] [--strict]

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
  const labels = takeValue(args, "--labels", "");
  const labelTemplate = takeValue(args, "--label-template", "");
  const includeText = takeBool(args, "--include-text");
  const includeSimilar = takeBool(args, "--experimental-similar");
  const strict = takeBool(args, "--strict");
  const similarityThreshold = Number(takeValue(args, "--similarity-threshold", "0.65"));
  if (!Number.isFinite(similarityThreshold) || similarityThreshold <= 0 || similarityThreshold > 1) {
    throw new UsageError("--similarity-threshold must be greater than 0 and at most 1");
  }
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) throw new UsageError(`unknown flag: ${unknown}`);
  return { manifest, format, out, labels, labelTemplate, includeText, includeSimilar, strict, similarityThreshold };
}

function fingerprint(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLabelEntry(entry) {
  if (!isRecord(entry)) throw new UsageError("label entries must be objects");
  const fingerprint = entry.fingerprint;
  if (typeof fingerprint !== "string" || fingerprint.length === 0) throw new UsageError("label entries require a fingerprint");
  const decision = entry.decision ?? "unreviewed";
  if (!VALID_DECISIONS.has(decision)) throw new UsageError(`invalid label decision for ${fingerprint}: ${decision}`);
  const note = entry.note ?? "";
  if (typeof note !== "string") throw new UsageError(`label note for ${fingerprint} must be a string`);
  return { fingerprint, decision, note };
}

function labelMap(labels) {
  const map = new Map();
  if (!labels) return map;
  if (!Array.isArray(labels) && !isRecord(labels)) throw new UsageError("labels must be an object or array");
  const entries = Array.isArray(labels)
    ? labels
    : Object.entries(labels).map(([fingerprint, value]) => {
        if (!isRecord(value)) throw new UsageError(`label for ${fingerprint} must be an object`);
        return { fingerprint, ...value };
      });
  for (const entry of entries) {
    const label = normalizeLabelEntry(entry);
    if (map.has(label.fingerprint)) throw new UsageError(`duplicate label fingerprint: ${label.fingerprint}`);
    map.set(label.fingerprint, { decision: label.decision, note: label.note });
  }
  return map;
}

function normalizeSignal(signal) {
  if (signal === "surfaceOverlap") return "surface_overlap";
  if (signal === "risk") return "risk_summary";
  return signal;
}

function requiredSignals(thresholds) {
  const signals = thresholds.requiredSignals ?? DEFAULT_THRESHOLDS.requiredSignals;
  if (!Array.isArray(signals)) throw new UsageError("thresholds.requiredSignals must be an array");
  const normalized = signals.map(normalizeSignal);
  for (const signal of normalized) {
    if (!VALID_REQUIRED_SIGNALS.has(signal)) throw new UsageError(`invalid required signal: ${signal}`);
  }
  return new Set(normalized);
}

function splitFor(occurrences, splitById) {
  const splits = [...new Set(occurrences.map((occurrence) => splitById.get(occurrence.path) ?? "unknown"))].sort();
  return splits.length === 1 ? splits[0] : "mixed";
}

function splitsFor(occurrences, splitById) {
  return [...new Set(occurrences.map((occurrence) => splitById.get(occurrence.path) ?? "unknown"))].sort();
}

function locationText(occurrences) {
  return occurrences.map((occurrence) => `${occurrence.path}:${occurrence.line}`).join(", ");
}

function emptyDecisionCounts() {
  return { actionable: 0, noise: 0, unsafe: 0, missed: 0, unreviewed: 0 };
}

function decisionCounts(findings) {
  const counts = emptyDecisionCounts();
  for (const finding of findings) counts[finding.decision] += 1;
  return counts;
}

function decisionCountsBySplit(findings) {
  const counts = {};
  for (const finding of findings) {
    for (const split of finding.splits ?? [finding.split]) {
      counts[split] ??= emptyDecisionCounts();
      counts[split][finding.decision] += 1;
    }
  }
  return counts;
}

function usefulRate(counts) {
  const reviewed = counts.actionable + counts.noise + counts.unsafe;
  return reviewed === 0 ? null : Number((counts.actionable / reviewed).toFixed(3));
}

function usefulRatesBySplit(countsBySplit) {
  const rates = {};
  for (const [split, counts] of Object.entries(countsBySplit)) {
    rates[split] = usefulRate(counts);
  }
  return rates;
}

function labelCoverage(findings, staleLabels) {
  const unreviewed = findings.filter((finding) => finding.decision === "unreviewed").length;
  const reviewed = findings.length - unreviewed;
  return {
    reviewed,
    unreviewed,
    stale: staleLabels.length,
    reviewedRate: findings.length === 0 ? null : Number((reviewed / findings.length).toFixed(3)),
  };
}

function decorateDuplicate(candidate, splitById, labels, includeText) {
  const id = fingerprint({ kind: "duplicate", text: candidate.text, recommendation: candidate.recommendation, risks: candidate.risks });
  const label = labels.get(id) ?? { decision: "unreviewed", note: "" };
  return {
    fingerprint: id,
    kind: "duplicate",
    split: splitFor(candidate.occurrences, splitById),
    splits: splitsFor(candidate.occurrences, splitById),
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
    splits: splitsFor(occurrences, splitById),
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
    splits: splitsFor(occurrences, splitById),
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
    splits: splitsFor(candidate.occurrences, splitById),
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

function addUsefulRateWarning(warnings, label, rate, threshold) {
  if (rate === null || rate === undefined) {
    warnings.push(`${label} useful rate is unavailable; no reviewed ${label} findings`);
  } else if (rate < threshold) {
    warnings.push(`${label} useful rate is ${rate}; target is at least ${threshold}`);
  }
}

function signalStatus({ findingCounts, findingsByKind, required, usefulRates, usefulRatesBySplit, decisionsBySplit }) {
  const statuses = {};
  for (const signal of Object.values(SIGNALS)) {
    const findingCount = findingCounts[signal.key] ?? 0;
    const holdoutCount = decisionsBySplit[signal.key]?.holdout
      ? Object.values(decisionsBySplit[signal.key].holdout).reduce((sum, count) => sum + count, 0)
      : 0;
    statuses[signal.key] = {
      signal: signal.findingKind,
      required: required.has(signal.findingKind),
      findings: findingCount,
      reportFindings: findingsByKind[signal.findingKind] ?? 0,
      holdoutFindings: holdoutCount,
      usefulRate: usefulRates[signal.key],
      holdoutUsefulRate: usefulRatesBySplit[signal.key]?.holdout ?? null,
      active: findingCount > 0 || (findingsByKind[signal.findingKind] ?? 0) > 0,
    };
  }
  return statuses;
}

function addSignalWarnings(warnings, { signal, status, thresholds, usefulRatesBySplit }) {
  if (!signal.threshold) return;
  const threshold = thresholds[signal.threshold];
  if (!status.active && !status.required) return;
  if (!status.active && status.required) {
    warnings.push(`${signal.label} signal is required but produced no report findings`);
    return;
  }
  addUsefulRateWarning(warnings, signal.label, status.usefulRate, threshold);
  if (status.required || status.holdoutFindings > 0) {
    addUsefulRateWarning(warnings, `holdout ${signal.label}`, usefulRatesBySplit[signal.key]?.holdout, threshold);
  }
}

function corpusWarnings({
  documents,
  roots,
  splitCounts,
  findings,
  labelStats,
  riskFindingCount,
  staleLabels,
  thresholds,
  totalLines,
  usefulRatesBySplit,
  signalStatuses,
}) {
  const warnings = [];
  if (documents.length < thresholds.minDocuments) {
    warnings.push(`corpus has ${documents.length} documents; target is at least ${thresholds.minDocuments}`);
  }
  if (roots.size < thresholds.minRoots) {
    warnings.push(`corpus has ${roots.size} roots; target is at least ${thresholds.minRoots}`);
  }
  if ((splitCounts.holdout ?? 0) === 0) warnings.push("corpus has no holdout documents");
  if (findings.length === 0) {
    warnings.push("corpus produced no report findings; usefulness cannot be assessed");
  } else if (labelStats.unreviewed === findings.length) {
    warnings.push("findings have no manual labels yet");
  } else if (labelStats.unreviewed > 0) {
    warnings.push(`${labelStats.unreviewed} findings remain unreviewed; strict release validation requires all findings to be labeled`);
  }
  if (staleLabels.length > 0) {
    warnings.push(`${staleLabels.length} labels do not match current findings; refresh or remove stale labels`);
  }
  const reviewItemsPerKloc = perKloc(findings.length, totalLines);
  if (reviewItemsPerKloc > thresholds.maxReviewItemsPerKloc) {
    warnings.push(`review item load is ${reviewItemsPerKloc.toFixed(1)} per 1,000 lines; target is at most ${thresholds.maxReviewItemsPerKloc}`);
  }
  const riskPerKloc = perKloc(riskFindingCount, totalLines);
  if (riskPerKloc > thresholds.maxRiskFindingsPerKloc) {
    warnings.push(`risk finding load is ${riskPerKloc.toFixed(1)} per 1,000 lines; target is at most ${thresholds.maxRiskFindingsPerKloc}`);
  }
  if ((splitCounts.holdout ?? 0) > 0) {
    for (const signal of Object.values(SIGNALS)) {
      addSignalWarnings(warnings, { signal, status: signalStatuses[signal.key], thresholds, usefulRatesBySplit });
    }
  } else {
    for (const signal of Object.values(SIGNALS)) {
      if (!signal.threshold) continue;
      const status = signalStatuses[signal.key];
      if (!status.active && !status.required) continue;
      if (!status.active && status.required) {
        warnings.push(`${signal.label} signal is required but produced no report findings`);
      } else {
        addUsefulRateWarning(warnings, signal.label, status.usefulRate, thresholds[signal.threshold]);
      }
    }
  }
  return warnings;
}

function formatRate(rate) {
  return rate === null || rate === undefined ? "n/a" : rate;
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
    `- reviewed findings: ${payload.metrics.labelCoverage.reviewed}/${payload.findings.length}`,
    `- stale labels: ${payload.metrics.labelCoverage.stale}`,
    `- review item load: ${payload.metrics.reviewItemsPerKloc} per 1,000 lines`,
    `- risk finding load: ${payload.metrics.riskFindingsPerKloc} per 1,000 lines`,
    `- required signals: ${payload.metrics.requiredSignals.join(", ") || "none"}`,
    `- holdout duplicate useful rate: ${formatRate(payload.metrics.usefulRatesBySplit.duplicate.holdout)}`,
    `- holdout surface-overlap useful rate: ${formatRate(payload.metrics.usefulRatesBySplit.surfaceOverlap.holdout)}`,
    `- holdout risk-summary useful rate: ${formatRate(payload.metrics.usefulRatesBySplit.risk.holdout)}`,
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

function signalForFinding(finding) {
  if (finding.kind === "duplicate") return finding.recommendation;
  if (finding.kind === "risk_summary") return finding.risk;
  if (finding.kind === "surface_overlap") return finding.recommendation;
  if (finding.kind === "similar") return finding.recommendation;
  return "";
}

function labelTemplate(payload) {
  const labels = {};
  for (const finding of payload.findings) {
    labels[finding.fingerprint] = {
      decision: finding.decision,
      note: finding.note ?? "",
      kind: finding.kind,
      split: finding.split,
      splits: finding.splits,
      signal: signalForFinding(finding),
      locations: finding.locationText,
    };
  }
  return `${JSON.stringify(
    {
      schemaVersion: "rulemeter.validation.labels.v1",
      manifestPath: payload.manifestPath,
      labels,
      staleLabels: payload.staleLabels,
    },
    null,
    2,
  )}\n`;
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

async function loadLabelsFile(path) {
  if (!path) return {};
  const labelsPath = resolve(path);
  const parsed = JSON.parse(await readFile(labelsPath, "utf8"));
  if (isRecord(parsed.labels)) return parsed.labels;
  if (isRecord(parsed)) return parsed;
  throw new UsageError("--labels must point to a labels object or a label-template file");
}

async function buildPayload(options) {
  const loaded = await loadManifest(options.manifest);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(loaded.manifest.thresholds ?? {}) };
  const required = requiredSignals(thresholds);
  const labels = labelMap({ ...(loaded.manifest.labels ?? {}), ...(await loadLabelsFile(options.labels)) });
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
  const findingsByKind = {
    duplicate: findings.filter((finding) => finding.kind === "duplicate").length,
    surface_overlap: findings.filter((finding) => finding.kind === "surface_overlap").length,
    risk_summary: findings.filter((finding) => finding.kind === "risk_summary").length,
    similar: findings.filter((finding) => finding.kind === "similar").length,
  };
  const duplicateSplitCounts = decisionCountsBySplit(findings.filter((finding) => finding.kind === "duplicate"));
  const surfaceOverlapSplitCounts = decisionCountsBySplit(findings.filter((finding) => finding.kind === "surface_overlap"));
  const riskSummarySplitCounts = decisionCountsBySplit(findings.filter((finding) => finding.kind === "risk_summary"));
  const similarSplitCounts = decisionCountsBySplit(findings.filter((finding) => finding.kind === "similar"));
  const usefulRates = {
    duplicate: usefulRate(duplicateCounts),
    surfaceOverlap: usefulRate(surfaceOverlapCounts),
    risk: usefulRate(riskSummaryCounts),
    similar: usefulRate(similarCounts),
  };
  const splitUsefulRates = {
    duplicate: usefulRatesBySplit(duplicateSplitCounts),
    surfaceOverlap: usefulRatesBySplit(surfaceOverlapSplitCounts),
    risk: usefulRatesBySplit(riskSummarySplitCounts),
    similar: usefulRatesBySplit(similarSplitCounts),
  };
  const findingCounts = {
    duplicate: report.candidates.length,
    surfaceOverlap: report.surfaceOverlaps.length,
    risk: report.riskSummaries.length,
    similar: report.similarCandidates.length,
  };
  const decisionSplits = {
    duplicate: duplicateSplitCounts,
    surfaceOverlap: surfaceOverlapSplitCounts,
    risk: riskSummarySplitCounts,
    similar: similarSplitCounts,
  };
  const statuses = signalStatus({
    findingCounts,
    findingsByKind,
    required,
    usefulRates,
    usefulRatesBySplit: splitUsefulRates,
    decisionsBySplit: decisionSplits,
  });
  const findingFingerprints = new Set(findings.map((finding) => finding.fingerprint));
  const staleLabels = [...labels.keys()].filter((label) => !findingFingerprints.has(label)).sort();
  const labelStats = labelCoverage(findings, staleLabels);
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
      requiredSignals: [...required],
      reviewItemsPerKloc: Number(perKloc(findings.length, totalLines).toFixed(1)),
      riskFindingsPerKloc: Number(perKloc(report.riskFindings.length, totalLines).toFixed(1)),
      byKind: {
        duplicate: findingCounts.duplicate,
        surfaceOverlap: findingCounts.surfaceOverlap,
        risk: report.riskFindings.length,
        riskSummary: findingCounts.risk,
        similar: findingCounts.similar,
      },
      decisions: {
        duplicate: duplicateCounts,
        surfaceOverlap: surfaceOverlapCounts,
        risk: riskSummaryCounts,
        similar: similarCounts,
      },
      decisionsBySplit: decisionSplits,
      labelCoverage: labelStats,
      signalStatus: statuses,
      usefulRates: {
        duplicate: usefulRates.duplicate,
        surfaceOverlap: usefulRates.surfaceOverlap,
        risk: usefulRates.risk,
        similar: usefulRates.similar,
      },
      usefulRatesBySplit: splitUsefulRates,
    },
    findings,
    staleLabels,
    warnings: [],
  };
  payload.warnings = corpusWarnings({
    documents,
    roots,
    splitCounts,
    findings,
    labelStats,
    riskFindingCount: report.riskFindings.length,
    staleLabels,
    thresholds,
    totalLines,
    usefulRates,
    usefulRatesBySplit: splitUsefulRates,
    signalStatuses: statuses,
  });
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
  if (options.labelTemplate) {
    await mkdir(dirname(resolve(options.labelTemplate)), { recursive: true });
    await writeFile(options.labelTemplate, labelTemplate(payload), "utf8");
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
