import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("private corpus collector writes a manifest without copying instruction text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-collect-corpus-test-"));
  await mkdir(join(dir, "repo-a", "fixtures"), { recursive: true });
  await mkdir(join(dir, "repo-a", ".claude", "worktrees", "scratch"), { recursive: true });
  await mkdir(join(dir, "repo-b", ".github"), { recursive: true });
  await mkdir(join(dir, "repo-c", ".github", "instructions"), { recursive: true });
  await writeFile(join(dir, "repo-a", "AGENTS.md"), "- Actually run tests before claiming success.\n", "utf8");
  await writeFile(join(dir, "repo-a", "fixtures", "AGENTS.md"), "- Fixture files should not enter the private corpus.\n", "utf8");
  await writeFile(join(dir, "repo-a", ".claude", "worktrees", "scratch", "AGENTS.md"), "- Temporary worktrees should not enter the private corpus.\n", "utf8");
  await writeFile(join(dir, "repo-b", ".github", "copilot-instructions.md"), "- Ask before destructive operations.\n", "utf8");
  await writeFile(join(dir, "repo-c", ".github", "instructions", "review.instructions.md"), "- Preserve existing boundaries.\n", "utf8");
  await writeFile(join(dir, "README.md"), "Not an instruction file.\n", "utf8");

  const out = join(dir, "manifest.json");
  await writeFile(
    out,
    JSON.stringify(
      {
        schemaVersion: "rulemeter.validation.v1",
        labels: {
          oldfingerprint000: {
            decision: "actionable",
            note: "Keep existing private review labels when regenerating.",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/collect-corpus.mjs", "--root", dir, "--out", out, "--holdout-ratio", "0.5"],
    { cwd: process.cwd() },
  );
  const manifest = JSON.parse(await readFile(out, "utf8"));
  const ids = manifest.documents.map((document) => document.id).sort();

  assert.match(stdout, /wrote 3 documents \(2 holdout\)/u);
  assert.equal(manifest.schemaVersion, "rulemeter.validation.v1");
  assert.deepEqual(ids, ["repo-a/AGENTS.md", "repo-b/.github/copilot-instructions.md", "repo-c/.github/instructions/review.instructions.md"]);
  assert.ok(manifest.documents.every((document) => document.path.startsWith(dir)));
  assert.ok(manifest.documents.every((document) => !("text" in document)));
  assert.equal(manifest.documents.filter((document) => document.split === "holdout").length, 2);
  assert.equal(manifest.documents.find((document) => document.id === "repo-b/.github/copilot-instructions.md").root, "repo-b");
  assert.deepEqual(Object.keys(manifest.labels), ["oldfingerprint000"]);
  assert.deepEqual(manifest.thresholds.requiredSignals, ["duplicate", "surface_overlap", "risk_summary"]);
});
