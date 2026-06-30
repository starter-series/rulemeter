import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
      "- Never paste production secrets into chat.",
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

async function corpusWithoutSameFileDuplicates(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-corpus-no-duplicate-test-"));
  const repoA = join(dir, "repo-a");
  const repoB = join(dir, "repo-b");
  await mkdir(repoA, { recursive: true });
  await mkdir(repoB, { recursive: true });
  const sharedRule = "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.";
  await writeFile(
    join(repoA, "AGENTS.md"),
    [sharedRule, "- Actually run tests before claiming success.", "- Never paste production secrets into chat."].join("\n"),
    "utf8",
  );
  await writeFile(
    join(repoB, "CLAUDE.md"),
    [sharedRule, "- Ask before destructive operations."].join("\n"),
    "utf8",
  );
  const manifestPath = join(dir, "corpus.json");
  const thresholds = {
    minDocuments: 2,
    minRoots: 2,
    maxReviewItemsPerKloc: 1000,
    maxRiskFindingsPerKloc: 1000,
    ...(options.requiredSignals ? { requiredSignals: options.requiredSignals } : {}),
  };
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: "rulemeter.validation.v1",
        thresholds,
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

async function labelAllFindings(manifest, decision = "actionable") {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = Object.fromEntries(
    payload.findings.map((finding) => [
      finding.fingerprint,
      {
        decision,
        note: "Synthetic review label.",
      },
    ]),
  );
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");
  return payload;
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
  assert.equal(payload.metrics.byKind.risk, 3);
  assert.equal(payload.metrics.byKind.riskSummary, 3);
  assert.equal(typeof payload.metrics.usefulRatesBySplit.risk, "object");
  assert.ok(payload.findings.some((finding) => finding.split === "mixed" && finding.splits.includes("holdout")));
  assert.equal(payload.metrics.labelCoverage.reviewed, 0);
  assert.equal(payload.metrics.labelCoverage.unreviewed, payload.findings.length);
  assert.equal(payload.metrics.labelCoverage.stale, 0);
  assert.deepEqual(payload.staleLabels, []);
  assert.ok(payload.findings.some((finding) => finding.kind === "risk_summary"));
  assert.ok(payload.findings.every((finding) => finding.kind !== "risk"));
  assert.ok(payload.findings.every((finding) => typeof finding.fingerprint === "string"));
  assert.ok(payload.findings.every((finding) => !("text" in finding)));
  assert.ok(payload.warnings.some((warning) => warning.includes("duplicate useful rate is unavailable")));
  assert.deepEqual(payload.metrics.requiredSignals, ["duplicate", "surface_overlap", "risk_summary"]);
});

test("strict corpus validation rejects missing default duplicate signal", async () => {
  const manifest = await corpusWithoutSameFileDuplicates();
  await labelAllFindings(manifest);

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--strict"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 1);
      const strictPayload = JSON.parse(error.stdout);
      assert.equal(strictPayload.metrics.byKind.duplicate, 0);
      assert.equal(strictPayload.metrics.signalStatus.duplicate.required, true);
      assert.ok(strictPayload.warnings.some((warning) => warning.includes("duplicate signal is required but produced no report findings")));
      return true;
    },
  );
});

test("manifest can narrow required signals for internal-helper validation", async () => {
  const manifest = await corpusWithoutSameFileDuplicates({ requiredSignals: ["surface_overlap", "risk_summary"] });
  await labelAllFindings(manifest);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--strict"],
    { cwd: process.cwd() },
  );
  const payload = JSON.parse(stdout);

  assert.deepEqual(payload.metrics.requiredSignals, ["surface_overlap", "risk_summary"]);
  assert.equal(payload.metrics.signalStatus.duplicate.required, false);
  assert.equal(payload.metrics.signalStatus.duplicate.active, false);
  assert.deepEqual(payload.warnings, []);
});

test("corpus validation writes a private label template without raw text", async () => {
  const manifest = await corpusFixture();
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-label-template-test-"));
  const labelPath = join(dir, "labels.json");
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--label-template", labelPath],
    { cwd: process.cwd() },
  );
  const payload = JSON.parse(stdout);
  const template = JSON.parse(await readFile(labelPath, "utf8"));
  const labels = Object.values(template.labels);

  assert.equal(template.schemaVersion, "rulemeter.validation.labels.v1");
  assert.equal(template.manifestPath, manifest);
  assert.equal(labels.length, payload.findings.length);
  assert.ok(labels.every((label) => typeof label.kind === "string"));
  assert.ok(labels.every((label) => typeof label.locations === "string"));
  assert.ok(labels.every((label) => !("text" in label)));
  assert.ok(labels.every((label) => !("exampleTexts" in label)));
});

test("corpus validation can read private labels from a template file", async () => {
  const manifest = await corpusWithoutSameFileDuplicates({ requiredSignals: ["surface_overlap", "risk_summary"] });
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-labels-file-test-"));
  const labelPath = join(dir, "labels.review.json");
  await execFileAsync(
    process.execPath,
    ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--label-template", labelPath],
    { cwd: process.cwd() },
  );
  const template = JSON.parse(await readFile(labelPath, "utf8"));
  for (const label of Object.values(template.labels)) {
    label.decision = "actionable";
    label.note = "Reviewed from separate private labels file.";
  }
  await writeFile(labelPath, JSON.stringify(template, null, 2), "utf8");

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/validate-corpus.mjs", "--manifest", manifest, "--labels", labelPath, "--format", "json", "--strict"],
    { cwd: process.cwd() },
  );
  const payload = JSON.parse(stdout);

  assert.equal(payload.metrics.labelCoverage.unreviewed, 0);
  assert.equal(payload.metrics.labelCoverage.reviewed, payload.findings.length);
  assert.equal(payload.metrics.usefulRates.surfaceOverlap, 1);
  assert.equal(payload.metrics.usefulRates.risk, 1);
  assert.deepEqual(payload.warnings, []);
});

test("corpus validation rejects unsupported required signals", async () => {
  const manifest = await corpusWithoutSameFileDuplicates({ requiredSignals: ["similar"] });

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /invalid required signal: similar/u);
      return true;
    },
  );
});

test("strict corpus validation rejects weak holdout usefulness even when aggregate passes", async () => {
  const manifest = await corpusFixture();
  const { stdout } = await execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = Object.fromEntries(
    payload.findings.map((finding) => [
      finding.fingerprint,
      {
        decision: finding.kind === "risk_summary" && finding.split === "holdout" ? "noise" : "actionable",
        note: "Synthetic review label.",
      },
    ]),
  );
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--strict"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 1);
      const strictPayload = JSON.parse(error.stdout);
      assert.equal(strictPayload.metrics.usefulRates.risk, 0.667);
      assert.equal(strictPayload.metrics.usefulRatesBySplit.risk.holdout, 0);
      assert.equal(strictPayload.metrics.decisionsBySplit.risk.holdout.noise, 1);
      assert.ok(strictPayload.warnings.some((warning) => warning.includes("holdout risk-summary useful rate is 0")));
      return true;
    },
  );
});

test("strict corpus validation reports stale labels", async () => {
  const manifest = await corpusFixture();
  const { stdout } = await execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = {
    ...Object.fromEntries(
      payload.findings.map((finding) => [
        finding.fingerprint,
        {
          decision: "actionable",
          note: "Synthetic review label.",
        },
      ]),
    ),
    stale00000000000: {
      decision: "actionable",
      note: "Old fingerprint from a previous run.",
    },
  };
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--strict"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 1);
      const strictPayload = JSON.parse(error.stdout);
      assert.equal(strictPayload.metrics.labelCoverage.stale, 1);
      assert.deepEqual(strictPayload.staleLabels, ["stale00000000000"]);
      assert.ok(strictPayload.warnings.some((warning) => warning.includes("labels do not match current findings")));
      return true;
    },
  );
});

test("corpus validation rejects malformed label entries", async () => {
  const manifest = await corpusFixture();
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = {
    badlabel00000000: "actionable",
  };
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /label for badlabel00000000 must be an object/u);
      return true;
    },
  );
});

test("corpus validation rejects duplicate label fingerprints", async () => {
  const manifest = await corpusFixture();
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = [
    { fingerprint: "dupelabel0000000", decision: "actionable" },
    { fingerprint: "dupelabel0000000", decision: "noise" },
  ];
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /duplicate label fingerprint: dupelabel0000000/u);
      return true;
    },
  );
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

test("strict corpus validation rejects partially labeled findings", async () => {
  const manifest = await corpusFixture();
  const { stdout } = await execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  const manifestJson = JSON.parse(await readFile(manifest, "utf8"));
  manifestJson.labels = {
    [payload.findings[0].fingerprint]: {
      decision: "actionable",
      note: "Reviewed one finding only.",
    },
  };
  await writeFile(manifest, JSON.stringify(manifestJson, null, 2), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["scripts/validate-corpus.mjs", "--manifest", manifest, "--format", "json", "--strict"], {
      cwd: process.cwd(),
    }),
    (error) => {
      assert.equal(error.code, 1);
      const strictPayload = JSON.parse(error.stdout);
      assert.equal(strictPayload.metrics.labelCoverage.reviewed, 1);
      assert.ok(strictPayload.warnings.some((warning) => warning.includes("findings remain unreviewed")));
      return true;
    },
  );
});
