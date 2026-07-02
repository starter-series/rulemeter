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

  assert.equal(report.schemaVersion, "rulemeter.sources.v2");
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

test("nested memory files and modular rule directories are supplemental layers, not overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-layer-test-"));
  await mkdir(join(dir, ".claude", "rules"), { recursive: true });
  await mkdir(join(dir, ".claude", "skills", "deploy"), { recursive: true });
  await mkdir(join(dir, "packages", "api"), { recursive: true });
  await writeFile(join(dir, "CLAUDE.md"), "- Run the project test suite before committing.\n", "utf8");
  await writeFile(join(dir, "CLAUDE.local.md"), "- Personal local preference rule.\n", "utf8");
  await writeFile(join(dir, ".claude", "rules", "style.md"), "- Prefer named exports.\n", "utf8");
  await writeFile(join(dir, ".claude", "skills", "deploy", "SKILL.md"), "- Deploy checklist rule.\n", "utf8");
  await writeFile(join(dir, "packages", "api", "CLAUDE.md"), "- API package specific rule.\n", "utf8");

  const report = await analyzeInstructionSources(
    ["CLAUDE.md", "CLAUDE.local.md", ".claude/rules/style.md", ".claude/skills/deploy/SKILL.md", "packages/api/CLAUDE.md"],
    dir,
  );

  assert.equal(report.canonicalPath, "CLAUDE.md");
  assert.deepEqual(
    Object.fromEntries(report.files.map((file) => [file.path, file.role])),
    {
      "CLAUDE.md": "canonical",
      "CLAUDE.local.md": "contextual_layer",
      ".claude/rules/style.md": "contextual_layer",
      ".claude/skills/deploy/SKILL.md": "contextual_layer",
      "packages/api/CLAUDE.md": "contextual_layer",
    },
  );
  assert.equal(report.sourceStrategy, "standalone");
  assert.deepEqual(report.warnings, []);
});

test("code spans, fenced blocks, and email-like text are not import references", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-import-noise-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Canonical local rule.\n", "utf8");
  await writeFile(
    join(dir, "CLAUDE.md"),
    [
      "We do not use `@AGENTS.md` imports here.",
      "Double backticks do not import either: ``@AGENTS.md``.",
      "A stripped span must not fabricate a boundary: prefix`code`@AGENTS.md stays glued.",
      "",
      "```",
      "@docs/example.md",
      "```",
      "",
      "````",
      "A longer fence can contain ``` lines without closing.",
      "@docs/nested-example.md",
      "````",
      "",
      "- Contact admin@example.md for repository access.",
      "- Claude-only rule that differs from the canonical file.",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = await analyzeInstructionSources(["AGENTS.md", "CLAUDE.md"], dir);
  const claude = report.files.find((file) => file.path === "CLAUDE.md");

  assert.deepEqual(claude?.imports, []);
  assert.equal(claude?.role, "local_override");
  assert.ok(report.warnings.some((warning) => warning.code === "LOCAL_OVERRIDE"));
  assert.ok(!report.warnings.some((warning) => warning.code === "IMPORT_TARGET_OUTSIDE_SCAN"));
});

test("memory files directly under dot directories stay root-equivalent, not layers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-root-equivalent-test-"));
  await mkdir(join(dir, ".claude"), { recursive: true });
  await mkdir(join(dir, ".agents"), { recursive: true });
  await writeFile(join(dir, "AGENTS.md"), "- Canonical local rule.\n", "utf8");
  await writeFile(join(dir, ".claude", "CLAUDE.md"), "- Divergent alternate-location memory.\n", "utf8");
  await writeFile(join(dir, ".agents", "AGENTS.md"), "- Divergent antigravity root file.\n", "utf8");

  const report = await analyzeInstructionSources(["AGENTS.md", ".claude/CLAUDE.md", ".agents/AGENTS.md"], dir);

  assert.equal(report.files.find((file) => file.path === ".claude/CLAUDE.md")?.role, "local_override");
  assert.equal(report.files.find((file) => file.path === ".agents/AGENTS.md")?.role, "local_override");
  assert.equal(report.warnings.filter((warning) => warning.code === "LOCAL_OVERRIDE").length, 2);
});

test("import alias requires no instruction text beyond the import", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-alias-content-test-"));
  await writeFile(join(dir, "AGENTS.md"), "- Canonical local rule.\n", "utf8");
  await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n\n- Extra rule that only Claude should follow.\n", "utf8");

  const report = await analyzeInstructionSources(["AGENTS.md", "CLAUDE.md"], dir);
  const claude = report.files.find((file) => file.path === "CLAUDE.md");

  assert.equal(claude?.imports[0]?.path, "AGENTS.md");
  assert.equal(claude?.role, "local_override");
  assert.match(claude?.evidence ?? "", /adds instruction text beyond AGENTS\.md/u);
  assert.equal(report.sourceStrategy, "mixed");
  assert.ok(report.warnings.some((warning) => warning.code === "LOCAL_OVERRIDE"));
});
