import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildRunReport, writeRulemeterState } from "../dist/index.js";

function queue(items) {
  return {
    schemaVersion: "rulemeter.queue.v1",
    auditSchemaVersion: "rulemeter.audit.v2",
    decisionSchemaVersion: "rulemeter.decisions.v1",
    files: ["AGENTS.md"],
    ledgerPath: ".rulemeter/decisions.json",
    counts: {
      total: items.length,
      review: items.filter((item) => item.priority === "review").length,
      hint: items.filter((item) => item.priority === "hint").length,
      byKind: {
        decision: items.filter((item) => item.kind === "decision").length,
        duplicate: items.filter((item) => item.kind === "duplicate").length,
        surface_overlap: items.filter((item) => item.kind === "surface_overlap").length,
        risk_summary: items.filter((item) => item.kind === "risk_summary").length,
        similar: items.filter((item) => item.kind === "similar").length,
      },
    },
    items,
  };
}

function duplicateItem(overrides = {}) {
  return {
    id: "QUEUE_DUP_01",
    kind: "duplicate",
    priority: "review",
    sourceId: "DUP_01",
    signal: "remove_duplicate",
    action: "review removal",
    message: "Same-file exact duplicate may be removable after review.",
    paths: ["AGENTS.md"],
    locations: ["AGENTS.md:1", "AGENTS.md:2"],
    preview: "Keep implementation local and verify before reporting.",
    ...overrides,
  };
}

test("run report classifies queue items as new known changed and resolved", () => {
  const first = buildRunReport(queue([duplicateItem()]), undefined, {
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(first.report.schemaVersion, "rulemeter.run.v1");
  assert.equal(first.nextState.schemaVersion, "rulemeter.state.v1");
  assert.equal(first.report.counts.new, 1);
  assert.equal(first.report.counts.newReview, 1);

  const second = buildRunReport(queue([duplicateItem()]), first.nextState, {
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.equal(second.report.counts.known, 1);
  assert.equal(second.report.counts.anyDelta, 0);

  const changed = buildRunReport(queue([duplicateItem({ locations: ["AGENTS.md:5", "AGENTS.md:6"] })]), second.nextState, {
    now: new Date("2026-01-03T00:00:00.000Z"),
  });
  assert.equal(changed.report.counts.changed, 1);
  assert.equal(changed.report.counts.changedReview, 1);
  assert.equal(changed.report.items[0].previousFingerprint, second.report.items[0].fingerprint);

  const resolved = buildRunReport(queue([]), changed.nextState, {
    now: new Date("2026-01-04T00:00:00.000Z"),
  });
  assert.equal(resolved.report.counts.resolved, 1);
  assert.equal(resolved.report.resolvedItems[0].status, "resolved");
});

test("writeRulemeterState stores only queue metadata and hashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-state-test-"));
  const statePath = join(dir, ".rulemeter", "state.json");
  const { nextState } = buildRunReport(queue([duplicateItem()]), undefined, {
    now: new Date("2026-01-01T00:00:00.000Z"),
  });

  await writeRulemeterState(nextState, statePath);
  const state = JSON.parse(await readFile(statePath, "utf8"));

  assert.equal(state.schemaVersion, "rulemeter.state.v1");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].preview, null);
  assert.match(state.items[0].fingerprint, /^[a-f0-9]{64}$/u);
});
