import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeInstructionSources, discoverPresetFiles } from "../dist/index.js";

async function topologyFixture() {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-sources-test-"));
  await mkdir(join(dir, ".github"), { recursive: true });
  await mkdir(join(dir, ".agents"), { recursive: true });
  const canonical = "- Keep changes scoped and verify locally.\n";
  await writeFile(join(dir, "AGENTS.md"), canonical, "utf8");
  await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n", "utf8");
  await writeFile(join(dir, ".github", "copilot-instructions.md"), canonical, "utf8");
  await writeFile(join(dir, "GEMINI.md"), "- Gemini gets a local tool-specific override.\n", "utf8");
  await symlink("../AGENTS.md", join(dir, ".agents", "agents.md"));
  return dir;
}

test("source topology classifies symlink import mirror and local override facts", async () => {
  const root = await topologyFixture();
  const report = await analyzeInstructionSources(
    ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", "GEMINI.md", ".agents/agents.md"],
    root,
  );

  assert.equal(report.schemaVersion, "rulemeter.sources.v1");
  assert.equal(report.canonicalPath, "AGENTS.md");
  assert.equal(report.sourceStrategy, "mixed");
  assert.deepEqual(
    Object.fromEntries(report.files.map((file) => [file.path, file.role])),
    {
      "AGENTS.md": "canonical",
      "CLAUDE.md": "import_alias",
      "GEMINI.md": "local_override",
      ".agents/agents.md": "symlink_alias",
      ".github/copilot-instructions.md": "verbatim_mirror",
    },
  );
  assert.equal(report.files.find((file) => file.path === "CLAUDE.md")?.imports[0]?.path, "AGENTS.md");
  assert.equal(report.files.find((file) => file.path === ".agents/agents.md")?.symlinkTarget, "AGENTS.md");
  assert.ok(report.warnings.some((warning) => warning.code === "VERBATIM_MIRROR_NOT_LINKED"));
  assert.ok(report.warnings.some((warning) => warning.code === "LOCAL_OVERRIDE"));
});

test("preset discovery includes symlinked instruction files for topology checks", async () => {
  const root = await topologyFixture();
  const files = await discoverPresetFiles("all", root);

  assert.ok(files.includes(".agents/agents.md"));
});

test("source topology reports single source strategy for import backed mirrors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-single-source-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Canonical local rule.\n", "utf8");
  await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n", "utf8");

  const report = await analyzeInstructionSources(["AGENTS.md", "CLAUDE.md"], dir);

  assert.equal(report.canonicalPath, "AGENTS.md");
  assert.equal(report.sourceStrategy, "single_source");
  assert.deepEqual(report.warnings, []);
});
