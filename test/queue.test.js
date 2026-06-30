import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyzeInstructionSources, auditRules, buildReviewQueue, decisionReportForSources } from "../dist/index.js";

test("review queue combines decisions duplicates overlaps and risk hints without scoring", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-queue-test-"));
  const shared = "- Preserve existing module boundaries and keep edits narrowly scoped to the requested behavior.";
  await writeFile(
    join(dir, "AGENTS.md"),
    [
      shared,
      shared,
      "- Actually run tests before claiming success.",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(dir, "CLAUDE.md"), `${shared}\n`, "utf8");
  await writeFile(join(dir, "GEMINI.md"), "- Gemini keeps a local override.\n", "utf8");

  const audit = await auditRules([join(dir, "AGENTS.md"), join(dir, "CLAUDE.md"), join(dir, "GEMINI.md")], { minChars: 5 });
  const sources = await analyzeInstructionSources(["AGENTS.md", "CLAUDE.md", "GEMINI.md"], dir);
  const decisions = decisionReportForSources(sources);
  const queue = buildReviewQueue(audit, decisions);

  assert.equal(queue.schemaVersion, "rulemeter.queue.v1");
  assert.equal(queue.counts.byKind.decision, 2);
  assert.equal(queue.counts.byKind.duplicate, 1);
  assert.equal(queue.counts.byKind.surface_overlap, 1);
  assert.equal(queue.counts.byKind.risk_summary, 1);
  assert.equal(queue.counts.hint, 1);
  assert.equal(queue.items.find((item) => item.kind === "risk_summary")?.priority, "hint");
  assert.ok(queue.items.every((item) => item.action.length > 0));
});
