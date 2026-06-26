import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function corpusFixture() {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-corpus-test-"));
  const repoA = join(dir, "repo-a");
  const repoB = join(dir, "repo-b");
  await mkdir(repoA, { recursive: true });
  await mkdir(repoB, { recursive: true });
  await writeFile(
    join(repoA, "AGENTS.md"),
    [
      "- Preserve existing module boundaries.",
      "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.",
      "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.",
      "- Actually run tests before claiming success.",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(repoB, "CLAUDE.md"),
    ["- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.", "- Ask before destructive operations."].join("\n"),
    "utf8",
  );
  const manifestPath = join(dir, "corpus.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: "rulemeter.validation.v1",
        thresholds: { minDocuments: 2, minRoots: 2 },
        documents: [
          { id: "repo-a/AGENTS.md", path: "repo-a/AGENTS.md", root: "repo-a", split: "calibration" },
          { id: "repo-b/CLAUDE.md", path: "repo-b/CLAUDE.md", root: "repo-b", split: "holdout" },
        ],
        labels: {},
      },
      null,
      2,
    ),
    "utf8",
  );
  return manifestPath;
}

test("corpus validation emits fingerprinted JSON without raw text by default", async () => {
  const manifest = await corpusFixture();
  const { stdout } = await execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);

  assert.equal(payload.schemaVersion, "rulemeter.validation.v1");
  assert.equal(payload.corpus.documents, 2);
  assert.equal(payload.corpus.roots, 2);
  assert.equal(typeof payload.metrics.reviewItemsPerKloc, "number");
  assert.equal(typeof payload.metrics.riskFindingsPerKloc, "number");
  assert.equal(payload.metrics.byKind.duplicate, 1);
  assert.equal(payload.metrics.byKind.surfaceOverlap, 1);
  assert.equal(payload.metrics.byKind.risk, 2);
  assert.equal(payload.metrics.byKind.riskSummary, 2);
  assert.ok(payload.findings.some((finding) => finding.kind === "risk_summary"));
  assert.ok(payload.findings.every((finding) => finding.kind !== "risk"));
  assert.ok(payload.findings.every((finding) => typeof finding.fingerprint === "string"));
  assert.ok(payload.findings.every((finding) => !("text" in finding)));
});

test("corpus validation can include local text for private review", async () => {
  const manifest = await corpusFixture();
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--include-text"],
    { cwd: process.cwd() },
  );
  const payload = JSON.parse(stdout);

  assert.ok(payload.findings.some((finding) => "text" in finding));
  assert.ok(payload.findings.some((finding) => Array.isArray(finding.exampleTexts)));
});
