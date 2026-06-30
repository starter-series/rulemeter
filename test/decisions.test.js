import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { acceptSourceDecisions, analyzeInstructionSources, decisionReportForSources, loadDecisionLedger } from "../dist/index.js";

test("decision ledger ratifies source topology warnings and marks changed evidence stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-decisions-test-"));
  const ledgerPath = join(dir, ".rulemeter", "decisions.json");
  await writeFile(join(dir, "AGENTS.md"), "- Keep changes scoped and verify locally.\n", "utf8");
  await writeFile(join(dir, "GEMINI.md"), "- Gemini keeps a local override.\n", "utf8");

  const source = await analyzeInstructionSources(["AGENTS.md", "GEMINI.md"], dir);
  const pending = decisionReportForSources(source, await loadDecisionLedger(ledgerPath), ledgerPath);

  assert.equal(pending.schemaVersion, "rulemeter.decisions.v1");
  assert.equal(pending.counts.pending, 1);
  assert.equal(pending.items[0].signal, "LOCAL_OVERRIDE");
  assert.equal(pending.items[0].status, "pending");

  const accepted = await acceptSourceDecisions(source, {
    ledgerPath,
    accept: "all",
    note: "Owner approved this tool-specific override.",
    now: new Date("2026-06-30T00:00:00.000Z"),
  });
  assert.equal(accepted.counts.accepted, 1);
  assert.equal(accepted.counts.pending, 0);
  assert.equal(accepted.items[0].acceptedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(accepted.items[0].note, "Owner approved this tool-specific override.");

  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  assert.equal(ledger.schemaVersion, "rulemeter.decisions.v1");
  assert.equal(ledger.decisions.length, 1);

  await writeFile(join(dir, "GEMINI.md"), "- Gemini keeps a changed local override.\n", "utf8");
  const changedSource = await analyzeInstructionSources(["AGENTS.md", "GEMINI.md"], dir);
  const stale = decisionReportForSources(changedSource, await loadDecisionLedger(ledgerPath), ledgerPath);

  assert.equal(stale.items[0].id, accepted.items[0].id);
  assert.equal(stale.counts.stale, 1);
  assert.equal(stale.items[0].status, "stale");
  assert.equal(stale.items[0].previousEvidenceHash, accepted.items[0].evidenceHash);
});
