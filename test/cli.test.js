import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("CLI audit emits JSON", async () => {
  const path = await fixture();
  const { stdout } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "audit", path, "--json", "--encoding", "cl100k_base", "--min-tokens", "5"],
    {
      cwd: process.cwd(),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, "rulemeter.audit.v1");
  assert.equal(payload.tokenizer, "cl100k_base");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
});

test("CLI count reports tokens", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "count", "RULE_01 = preserve existing style", "--encoding", "o200k_base"],
    {
      cwd: process.cwd(),
    },
  );
  assert.match(stdout, /tokenizer: o200k_base/);
  assert.match(stdout, /tokens: \d+/);
});

test("CLI count JSON includes schema version", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "count", "RULE_01 = preserve existing style", "--json", "--encoding", "cl100k_base"],
    {
      cwd: process.cwd(),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, "rulemeter.count.v1");
  assert.equal(payload.tokenizer, "cl100k_base");
  assert.equal(payload.warnings.length, 0);
  assert.equal(typeof payload.tokens, "number");
});

test("CLI errors on unknown explicit tokenizer", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ["dist/cli.js", "count", "hello", "--json", "--encoding", "not_real"], {
      cwd: process.cwd(),
    }),
    (error) => {
      const payload = JSON.parse(error.stderr);
      assert.equal(payload.schemaVersion, "rulemeter.error.v1");
      assert.equal(payload.error.code, "TOKENIZER_NOT_FOUND");
      return true;
    },
  );
});

test("CLI explains unsupported Claude and Gemini model names", async () => {
  for (const model of ["claude-opus-4", "gemini-1.5-pro"]) {
    await assert.rejects(
      execFileAsync(process.execPath, ["dist/cli.js", "count", "hello", "--json", "--model", model], {
        cwd: process.cwd(),
      }),
      (error) => {
        const payload = JSON.parse(error.stderr);
        assert.equal(payload.schemaVersion, "rulemeter.error.v1");
        assert.equal(payload.error.code, "TOKENIZER_NOT_FOUND");
        assert.match(payload.error.message, /js-tiktoken model mappings/);
        assert.match(payload.error.message, /approximation/);
        return true;
      },
    );
  }
});

test("CLI allows explicit fallback only when requested", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["dist/cli.js", "count", "hello", "--json", "--encoding", "not_real", "--allow-fallback"],
    {
      cwd: process.cwd(),
    },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.tokenizer, "fallback_regex");
  assert.equal(payload.warnings[0].code, "APPROXIMATE_TOKENIZER");
});

test("CLI audit reads config file", async () => {
  const path = await fixture();
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-config-test-"));
  const configPath = join(dir, "rulemeter.config.json");
  await writeFile(configPath, JSON.stringify({ aliasPrefix: "RM", encoding: "cl100k_base", minTokens: 5 }), "utf8");
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "audit", path, "--json", "--config", configPath], {
    cwd: process.cwd(),
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.configPath, configPath);
  assert.equal(payload.tokenizer, "cl100k_base");
  assert.match(payload.candidates[0].rule, /^RM_/);
  assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
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

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "audit", "--preset", "codex", "--json", "--encoding", "cl100k_base", "--min-tokens", "5"],
    { cwd: dir },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.preset, "codex");
  assert.deepEqual(payload.discoveredFiles, ["AGENTS.md", "packages/app/AGENTS.md"]);
  assert.deepEqual(payload.files, ["AGENTS.md", "packages/app/AGENTS.md"]);
  assert.equal(payload.candidates[0].recommendation, "remove_duplicate");
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
