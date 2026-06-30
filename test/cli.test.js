import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), "dist/cli.js");

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-cli-test-"));
  const path = join(dir, "task.md");
  await writeFile(
    path,
    [
      "- Keep implementation local and report exact file paths in the final response.",
      "- Keep implementation local and report exact file paths in the final response.",
    ].join("\n"),
    "utf8",
  );
  return path;
}

test("CLI audit subcommand help exits zero", async () => {
  for (const flag of ["--help", "-h"]) {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", flag], {
      cwd: process.cwd(),
    });
    assert.equal(stderr, "");
    assert.match(stdout, /^rulemeter audit/m);
    assert.match(stdout, /--fail-on duplicate\|risk\|similar/);
  }
});

test("CLI audit emits JSON", async () => {
  const path = await fixture();
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--json", "--min-chars", "5"], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, "rulemeter.audit.v2");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].id, "DUP_01");
  assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
});

test("CLI audit emits Markdown report", async () => {
  const path = await fixture();
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--format", "markdown", "--min-chars", "5"], {
    cwd: process.cwd(),
  });
  assert.match(stdout, /^# RuleMeter Report/m);
  assert.match(stdout, /- same-file duplicate actions: 1/);
  assert.match(stdout, /- keyword review findings: 0/);
  assert.match(stdout, /\| ID \| Action \| Risk \|/);
  assert.match(stdout, /\| `DUP_01` \| Probably removable \|/);
  assert.doesNotMatch(stdout, /remove_duplicate/);
  assert.doesNotMatch(stdout, /cache_hint|Cache hint/);
});

test("CLI table output uses reviewer actions instead of raw internals", async () => {
  const path = await fixture();
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--min-chars", "5"], {
    cwd: process.cwd(),
  });
  assert.match(stdout, /Same-file duplicate actions:/);
  assert.match(stdout, /Probably removable/);
  assert.doesNotMatch(stdout, /remove_duplicate/);
  assert.doesNotMatch(stdout, /cache_hint/);
});

test("CLI fail-on duplicate exits non-zero after printing report", async () => {
  const path = await fixture();
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--json", "--min-chars", "5", "--fail-on", "duplicate"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(payload.schemaVersion, "rulemeter.audit.v2");
      assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
      assert.match(error.stderr, /--fail-on duplicate matched/);
      return true;
    },
  );
});

test("CLI fail-on duplicate ignores cross-file review-only duplicates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-review-duplicate-test-"));
  const text = "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.";
  await writeFile(join(dir, "AGENTS.md"), `${text}\n`, "utf8");
  await writeFile(join(dir, "CLAUDE.md"), `${text}\n`, "utf8");

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "audit", join(dir, "AGENTS.md"), join(dir, "CLAUDE.md"), "--json", "--min-chars", "5", "--fail-on", "duplicate"],
    { cwd: process.cwd() },
  );
  const payload = JSON.parse(stdout);
  assert.equal(stderr, "");
  assert.equal(payload.candidates.length, 0);
  assert.equal(payload.surfaceOverlaps.length, 1);
  assert.equal(payload.surfaceOverlaps[0].recommendation, "review_duplicate");
});

test("CLI fail-on risk uses risk findings outside duplicate candidates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-risk-test-"));
  const path = join(dir, "AGENTS.md");
  await writeFile(path, "- Actually run tests and report the verification command before claiming success.\n", "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--json", "--min-chars", "5", "--fail-on", "risk"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(payload.schemaVersion, "rulemeter.audit.v2");
      assert.equal(payload.candidates.length, 0);
      assert.equal(payload.riskFindings.length, 1);
      assert.equal(payload.riskSummaries.length, 1);
      assert.equal(payload.riskSummaries[0].risk, "test_required");
      assert.deepEqual(payload.riskFindings[0].risks, ["test_required"]);
      assert.match(error.stderr, /--fail-on risk matched/);
      return true;
    },
  );
});

test("CLI experimental similar emits Markdown and fail-on similar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-similar-test-"));
  const path = join(dir, "AGENTS.md");
  await writeFile(
    path,
    [
      "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.",
      "- Keep edits narrowly scoped to requested behavior while preserving existing module boundaries.",
    ].join("\n"),
    "utf8",
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "audit", path, "--experimental-similar", "--format", "markdown", "--min-chars", "5"],
    { cwd: process.cwd() },
  );
  assert.match(stdout, /Lexical Similarity Reviews/);
  assert.match(stdout, /`SIM_01`/);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["dist/cli.js", "audit", path, "--experimental-similar", "--fail-on", "similar", "--json", "--min-chars", "5"],
      { cwd: process.cwd() },
    ),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(payload.similarCandidates.length, 1);
      assert.match(error.stderr, /--fail-on similar matched/);
      return true;
    },
  );
});

test("CLI reports typed unknown count command error", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "count", "hello", "--json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "UNKNOWN_COMMAND");
      return true;
    },
  );
});

test("CLI sources emits source-of-truth topology JSON and Markdown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-sources-cli-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Keep changes scoped and verify locally.\n", "utf8");
  await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n", "utf8");
  await writeFile(join(dir, "GEMINI.md"), "- Gemini has a local override.\n", "utf8");

  const json = await execFileAsync(process.execPath, [cliPath, "sources", "--json"], { cwd: dir });
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.schemaVersion, "rulemeter.sources.v1");
  assert.equal(payload.canonicalPath, "AGENTS.md");
  assert.equal(payload.files.find((file) => file.path === "CLAUDE.md").role, "import_alias");
  assert.equal(payload.files.find((file) => file.path === "GEMINI.md").role, "local_override");

  const markdown = await execFileAsync(process.execPath, [cliPath, "sources", "--format", "markdown"], { cwd: dir });
  assert.match(markdown.stdout, /^# RuleMeter Source Topology/m);
  assert.match(markdown.stdout, /imports canonical/);
  assert.match(markdown.stdout, /review: GEMINI\.md differs from AGENTS\.md/);
});

test("CLI decisions writes owner ledger and fails on unaccepted source warnings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-decisions-cli-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Keep changes scoped and verify locally.\n", "utf8");
  await writeFile(join(dir, "GEMINI.md"), "- Gemini keeps a local override.\n", "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "decisions", "--json", "--fail-on", "unaccepted"], { cwd: dir }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(payload.schemaVersion, "rulemeter.decisions.v1");
      assert.equal(payload.counts.pending, 1);
      assert.equal(payload.items[0].signal, "LOCAL_OVERRIDE");
      assert.match(error.stderr, /--fail-on unaccepted matched/);
      return true;
    },
  );

  const accepted = await execFileAsync(process.execPath, [cliPath, "decisions", "--accept", "all", "--json"], { cwd: dir });
  const payload = JSON.parse(accepted.stdout);
  assert.equal(payload.counts.pending, 0);
  assert.equal(payload.counts.accepted, 1);

  const ledger = JSON.parse(await readFile(join(dir, ".rulemeter", "decisions.json"), "utf8"));
  assert.equal(ledger.schemaVersion, "rulemeter.decisions.v1");
  assert.equal(ledger.decisions.length, 1);

  const markdown = await execFileAsync(process.execPath, [cliPath, "decisions", "--format", "markdown"], { cwd: dir });
  assert.match(markdown.stdout, /^# RuleMeter Decision Ledger/m);
  assert.match(markdown.stdout, /No pending or stale decision items/);
});

test("CLI queue emits review items and keeps keyword hints out of fail-on review", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-queue-cli-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Actually run tests before claiming success.\n", "utf8");

  const review = await execFileAsync(process.execPath, [cliPath, "queue", "--json", "--fail-on", "review", "--min-chars", "5"], { cwd: dir });
  const reviewPayload = JSON.parse(review.stdout);
  assert.equal(reviewPayload.schemaVersion, "rulemeter.queue.v1");
  assert.equal(reviewPayload.counts.review, 0);
  assert.equal(reviewPayload.counts.hint, 1);
  assert.equal(review.stderr, "");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "queue", "--json", "--fail-on", "any"], { cwd: dir }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(payload.counts.total, 1);
      assert.equal(payload.items[0].kind, "risk_summary");
      assert.equal(payload.items[0].priority, "hint");
      assert.match(error.stderr, /--fail-on any matched/);
      return true;
    },
  );

  const markdown = await execFileAsync(process.execPath, [cliPath, "queue", "--format", "markdown"], { cwd: dir });
  assert.match(markdown.stdout, /^# RuleMeter Review Queue/m);
  assert.match(markdown.stdout, /keyword hint items: 1/);
});

test("CLI audit reads config file", async () => {
  const path = await fixture();
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-config-test-"));
  const configPath = join(dir, "rulemeter.config.json");
  await writeFile(configPath, JSON.stringify({ minChars: 5 }), "utf8");
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--json", "--config", configPath], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.configPath, configPath);
  assert.equal(payload.candidates[0].id, "DUP_01");
  assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
});

test("CLI reports typed missing file errors", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "audit", "missing.md", "--json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "FILE_NOT_FOUND");
      return true;
    },
  );

  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "audit", "missing.md", "--format", "json"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "FILE_NOT_FOUND");
      return true;
    },
  );
});

test("CLI reports typed invalid config errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-bad-config-test-"));
  const configPath = join(dir, "rulemeter.config.json");
  await writeFile(configPath, "{ bad json", "utf8");
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "audit", "--preset", "all", "--json", "--config", configPath], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "CONFIG_INVALID_JSON");
      return true;
    },
  );
});

test("CLI rejects removed tokenizer and alias options", async () => {
  const path = await fixture();
  for (const flag of ["--encoding", "--model", "--allow-fallback", "--alias-prefix", "--min-tokens"]) {
    const args = ["dist/cli.js", "audit", path, "--json", flag];
    if (flag !== "--allow-fallback") args.push("value");
    await assert.rejects(
      execFileAsync(process.execPath, args, {
        cwd: process.cwd(),
      }),
      (error) => {
        const payload = JSON.parse(error.stderr);
        assert.equal(payload.schemaVersion, "rulemeter.error.v1");
        assert.ok(["UNKNOWN_FLAG", "INVALID_OPTION"].includes(payload.error.code), flag);
        return true;
      },
    );
  }
});

test("CLI empty preset list-files is allowed but audit reports NO_FILES_FOUND", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-empty-preset-test-"));
  const list = await execFileAsync(process.execPath, [cliPath, "audit", "--preset", "all", "--list-files", "--json"], {
    cwd: dir,
  });
  const discovery = JSON.parse(list.stdout);
  assert.equal(discovery.schemaVersion, "rulemeter.discovery.v1");
  assert.deepEqual(discovery.files, []);

  const formatList = await execFileAsync(process.execPath, [cliPath, "audit", "--preset", "all", "--list-files", "--format", "json"], {
    cwd: dir,
  });
  const formatDiscovery = JSON.parse(formatList.stdout);
  assert.equal(formatDiscovery.schemaVersion, "rulemeter.discovery.v1");
  assert.deepEqual(formatDiscovery.files, []);

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "audit", "--preset", "all", "--json"], {
      cwd: dir,
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "NO_FILES_FOUND");
      assert.match(payload.error.message, /Run from a repo root/);
      return true;
    },
  );

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "audit", "--preset", "all", "--format", "json"], {
      cwd: dir,
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "NO_FILES_FOUND");
      return true;
    },
  );
});

test("CLI preset discovers Codex instruction files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-preset-test-"));
  const nested = join(dir, "packages", "app");
  const ignored = join(dir, "node_modules", "fixture");
  await mkdir(nested, { recursive: true });
  await mkdir(ignored, { recursive: true });
  const text = "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.";
  await writeFile(join(dir, "AGENTS.md"), `${text}\n`, "utf8");
  await writeFile(join(nested, "AGENTS.md"), `${text}\n`, "utf8");
  await writeFile(join(ignored, "AGENTS.md"), `${text}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [cliPath, "audit", "--preset", "codex", "--json", "--min-chars", "5"], {
    cwd: dir,
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.preset, "codex");
  assert.deepEqual(payload.discoveredFiles, ["AGENTS.md", "packages/app/AGENTS.md"]);
  assert.deepEqual(payload.files, ["AGENTS.md", "packages/app/AGENTS.md"]);
  assert.equal(payload.candidates.length, 0);
  assert.equal(payload.surfaceOverlaps[0].recommendation, "review_duplicate");
});

test("CLI list-files JSON reports all preset discovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-list-test-"));
  await mkdir(join(dir, ".github", "instructions"), { recursive: true });
  await mkdir(join(dir, ".agents", "skills", "review"), { recursive: true });
  await mkdir(join(dir, ".agents", "workflows"), { recursive: true });
  await mkdir(join(dir, "fixtures"), { recursive: true });
  await writeFile(join(dir, "AGENTS.md"), "# Agents\n", "utf8");
  await writeFile(join(dir, "CLAUDE.md"), "# Claude\n", "utf8");
  await writeFile(join(dir, "GEMINI.md"), "# Gemini\n", "utf8");
  await writeFile(join(dir, ".github", "copilot-instructions.md"), "# Copilot\n", "utf8");
  await writeFile(join(dir, ".github", "instructions", "review.instructions.md"), "# Review\n", "utf8");
  await writeFile(join(dir, ".agents", "agents.md"), "# Antigravity\n", "utf8");
  await writeFile(join(dir, ".agents", "skills", "review", "SKILL.md"), "# Skill\n", "utf8");
  await writeFile(join(dir, ".agents", "workflows", "ship.md"), "# Workflow\n", "utf8");
  await writeFile(join(dir, "fixtures", "AGENTS.md"), "# Fixture\n", "utf8");

  const { stdout } = await execFileAsync(process.execPath, [cliPath, "audit", "--preset", "all", "--list-files", "--json"], {
    cwd: dir,
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, "rulemeter.discovery.v1");
  assert.equal(payload.preset, "all");
  assert.deepEqual(payload.files, [
    ".agents/agents.md",
    ".agents/skills/review/SKILL.md",
    ".agents/workflows/ship.md",
    ".github/copilot-instructions.md",
    ".github/instructions/review.instructions.md",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
  ]);
});
