import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  assert.equal(payload.tokenizer, "cl100k_base");
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.candidates[0].recommendation, "candidate");
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
