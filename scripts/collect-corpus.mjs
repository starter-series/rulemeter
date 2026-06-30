#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "out",
  "test",
  "tests",
  "tmp",
  "worktrees",
]);

const DOC_NAMES = new Set(["AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GEMINI.md", "copilot-instructions.md"]);

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

class UsageError extends Error {}

function usage() {
  return `Usage
  node scripts/collect-corpus.mjs --root PATH --out PATH [--holdout-ratio 0.2]

Builds a private RuleMeter validation manifest from local instruction files. It writes paths and metadata only; it does not copy instruction text.`;
}

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
  const root = takeValue(args, "--root", "");
  const out = takeValue(args, "--out", "");
  const holdoutRatio = Number(takeValue(args, "--holdout-ratio", "0.2"));
  if (!root) throw new UsageError("--root is required");
  if (!out) throw new UsageError("--out is required");
  if (!Number.isFinite(holdoutRatio) || holdoutRatio < 0 || holdoutRatio > 1) {
    throw new UsageError("--holdout-ratio must be between 0 and 1");
  }
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) throw new UsageError(`unknown flag: ${unknown}`);
  return { root: resolve(root), out: resolve(out), holdoutRatio };
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function isInstructionFile(path) {
  const name = basename(path);
  if (DOC_NAMES.has(name)) return true;
  const normalized = toPosix(path);
  return normalized.includes("/.github/instructions/") && name.endsWith(".instructions.md");
}

function rootForPath(scanRoot, path) {
  const parts = relative(scanRoot, path).split(sep);
  const markerIndex = parts.findIndex((part) => part === ".github" || part === ".claude" || part === ".agents");
  if (markerIndex > 0) return toPosix(parts.slice(0, markerIndex).join(sep));
  if (parts.length > 1) return toPosix(parts.slice(0, -1).join(sep));
  return ".";
}

async function discoverInstructionFiles(root) {
  const found = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) await walk(path);
      } else if (entry.isFile() && isInstructionFile(path)) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found.sort((left, right) => left.localeCompare(right));
}

function hashScore(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitAssignments(documents, holdoutRatio) {
  if (holdoutRatio === 0 || documents.length === 0) return new Set();
  const holdoutCount = Math.max(1, Math.round(documents.length * holdoutRatio));
  return new Set(
    documents
      .map((document) => ({ id: document.id, score: hashScore(document.id) }))
      .sort((left, right) => left.score.localeCompare(right.score))
      .slice(0, holdoutCount)
      .map((document) => document.id),
  );
}

async function existingLabels(path) {
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest && typeof manifest.labels === "object" && !Array.isArray(manifest.labels)) return manifest.labels;
  } catch {
    return {};
  }
  return {};
}

async function assertDirectory(path) {
  const info = await stat(path);
  if (!info.isDirectory()) throw new UsageError(`--root must be a directory: ${path}`);
}

async function buildManifest(options) {
  await assertDirectory(options.root);
  const paths = await discoverInstructionFiles(options.root);
  if (paths.length === 0) throw new UsageError(`no instruction files found under ${options.root}`);
  const documents = paths.map((path) => ({
    id: toPosix(relative(options.root, path)),
    path,
    root: rootForPath(options.root, path),
  }));
  const holdoutIds = splitAssignments(documents, options.holdoutRatio);
  return {
    schemaVersion: "rulemeter.validation.v1",
    description: "Private generated manifest. Do not commit unless every path and label is safe to publish.",
    thresholds: DEFAULT_THRESHOLDS,
    documents: documents.map((document) => ({
      ...document,
      split: holdoutIds.has(document.id) ? "holdout" : "calibration",
    })),
    labels: await existingLabels(options.out),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const manifest = await buildManifest(options);
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const holdout = manifest.documents.filter((document) => document.split === "holdout").length;
  console.log(`wrote ${manifest.documents.length} documents (${holdout} holdout) to ${options.out}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof UsageError ? `rulemeter corpus: ${error.message}` : error);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  },
);
