import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditDocuments, auditRules, classifyRisks } from "../dist/index.js";

async function tempFile(name, content) {
  const dir = await mkdtemp(join(tmpdir(), "rulemeter-test-"));
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

test("repeated low-risk rule recommends duplicate removal", async () => {
  const path = await tempFile(
    "task.md",
    [
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
    ].join("\n"),
  );
  const report = await auditRules([path], { minChars: 5 });
  assert.equal(report.schemaVersion, "rulemeter.audit.v2");
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].id, "DUP_01");
  assert.equal(report.candidates[0].recommendation, "remove_duplicate");
  assert.equal(report.candidates[0].repeats, 2);
});

test("cross-file low-risk duplicate is a review prompt, not a removal instruction", async () => {
  const text = "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.";
  const report = await auditDocuments(
    [
      { id: "AGENTS.md", text },
      { id: "CLAUDE.md", text },
    ],
    { minChars: 5 },
  );
  assert.equal(report.candidates.length, 0);
  assert.equal(report.surfaceOverlaps.length, 1);
  assert.equal(report.surfaceOverlaps[0].recommendation, "review_duplicate");
  assert.deepEqual(report.surfaceOverlaps[0].paths, ["AGENTS.md", "CLAUDE.md"]);
  assert.equal(report.surfaceOverlaps[0].duplicateTexts, 1);
});

test("generic authoring and strategy words do not trigger high-risk labels alone", () => {
  const labels = classifyRisks("Use a clear authoring strategy for small helper functions.");
  assert.deepEqual(labels, []);
});

test("common app words do not trigger high-risk labels alone", () => {
  const cases = [
    "Respect the user tool permission settings.",
    "Log in the user and redirect.",
    "Send a confirmation email.",
    "Fix the error state copy.",
    "Open the security settings screen.",
    "Validate the input field label.",
    "This repo has one developer (heznpc) running one session at a time.",
    "The product reduces approval fatigue for solo developers.",
    "검증 가능한 배지 설명을 유지하세요.",
    "보안 설정 화면을 유지하세요.",
    "Open the audit history panel.",
    "The layout sanitizer keeps labels tidy.",
    "검색 키워드 입력란을 유지하세요.",
    "문서 작성자 정보를 표시하세요.",
  ];
  for (const text of cases) assert.deepEqual(classifyRisks(text), [], text);
});

test("risk category inventory lines do not self-trigger labels", () => {
  const labels = classifyRisks(
    "Preserve high-risk rules explicitly when they mention identity, PII, approval, tests, strategy ratification, logs, errors, or security.",
  );
  assert.deepEqual(labels, []);
});

test("known risk phrasings are detected", () => {
  assert.deepEqual(classifyRisks("Run the full test suite in CI before merging"), ["test_required"]);
  assert.deepEqual(classifyRisks("Validate and sanitize all user input to prevent injection"), ["security_policy"]);
  assert.deepEqual(classifyRisks("Do not bypass the HMAC-chained audit log."), ["security_policy"]);
  assert.deepEqual(classifyRisks("Keep the path sanitizer because it prevents path-injection."), ["security_policy"]);
  assert.deepEqual(classifyRisks("테스트 실행 결과와 검증 명령을 보고하세요."), ["test_required"]);
  assert.deepEqual(classifyRisks("입력 검증과 인젝션 방지 규칙을 유지하세요."), ["security_policy"]);
});

test("documented holdout blind spots show the linter is not exhaustive", () => {
  const misses = [
    "Never paste production database passwords into chat.",
    "Encrypt customer records at rest using AES-256.",
    "Rotate production credentials every 90 days.",
    "Get written sign-off from the release manager before shipping.",
    "Escape all SQL parameters before running a query.",
  ];
  for (const text of misses) assert.deepEqual(classifyRisks(text), [], text);
});

test("risk findings scan single-stated rules outside duplicate candidates", async () => {
  const report = await auditDocuments(
    [
      {
        id: "memory://rules",
        text: "- Actually run tests and report the verification command before claiming success.",
      },
    ],
    { minChars: 5 },
  );
  assert.equal(report.candidates.length, 0);
  assert.equal(report.riskFindings.length, 1);
  assert.equal(report.riskSummaries.length, 1);
  assert.equal(report.riskSummaries[0].risk, "test_required");
  assert.equal(report.riskSummaries[0].findings, 1);
  assert.deepEqual(report.riskFindings[0].risks, ["test_required"]);
  assert.equal(report.riskFindings[0].occurrences[0].path, "memory://rules");
  assert.equal(report.riskFindings[0].occurrences[0].line, 1);
});

test("markdown code fences tables and blockquotes are skipped", async () => {
  const path = await tempFile(
    "CLAUDE.md",
    [
      "```bash",
      "npm run build && npm test",
      "```",
      "",
      "| Command | Meaning |",
      "|---|---|",
      "| npm test | test |",
      "",
      "> Quote this warning twice for context.",
      "> Quote this warning twice for context.",
      "",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.",
    ].join("\n"),
  );
  const report = await auditRules([path], { minChars: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].text, "Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior.");
});

test("wrapped list items stay one segment", async () => {
  const path = await tempFile(
    "AGENTS.md",
    [
      "- Preserve the existing module boundaries and keep edits narrowly scoped",
      "  to the requested behavior across touched files.",
      "- Preserve the existing module boundaries and keep edits narrowly scoped",
      "  to the requested behavior across touched files.",
    ].join("\n"),
  );
  const report = await auditRules([path], { minChars: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(
    report.candidates[0].text,
    "Preserve the existing module boundaries and keep edits narrowly scoped to the requested behavior across touched files.",
  );
  assert.equal(report.candidates[0].occurrences[0].line, 1);
  assert.equal(report.candidates[0].occurrences[1].line, 3);
});

test("auditDocuments audits in-memory service inputs", async () => {
  const text = [
    "- Keep generated reports read-only and never rewrite user instruction files.",
    "- Keep generated reports read-only and never rewrite user instruction files.",
  ].join("\n");
  const report = await auditDocuments([{ id: "memory://rules", text }], { minChars: 5 });
  assert.deepEqual(report.files, ["memory://rules"]);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].occurrences[0].path, "memory://rules");
});

test("experimental similar candidates find near duplicate rules", async () => {
  const report = await auditDocuments(
    [
      {
        id: "memory://rules",
        text: [
          "- Preserve existing module boundaries and keep edits narrowly scoped to requested behavior.",
          "- Keep edits narrowly scoped to requested behavior while preserving existing module boundaries.",
        ].join("\n"),
      },
    ],
    { includeSimilar: true, minChars: 5 },
  );
  assert.equal(report.candidates.length, 0);
  assert.equal(report.similarCandidates.length, 1);
  assert.equal(report.similarCandidates[0].id, "SIM_01");
  assert.equal(report.similarCandidates[0].recommendation, "review_similar");
  assert.ok(report.similarCandidates[0].similarity >= 0.5);
});

test("identity and PII rules stay explicit", async () => {
  const path = await tempFile(
    "AGENTS.md",
    [
      "- Public identity is Heznpc only and external surfaces must not include PII or API keys.",
      "- Public identity is Heznpc only and external surfaces must not include PII or API keys.",
    ].join("\n"),
  );
  const report = await auditRules([path], { minChars: 5 });
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].recommendation, "keep_explicit");
  assert.ok(report.candidates[0].risks.includes("identity"));
  assert.ok(report.candidates[0].risks.includes("pii"));
  assert.equal(report.riskFindings.length, 1);
  assert.equal(report.riskSummaries.length, 2);
  assert.ok(report.riskFindings[0].risks.includes("identity"));
  assert.ok(report.riskFindings[0].risks.includes("pii"));
});

test("each high-risk family stays explicit", async () => {
  const cases = {
    approval_required: "Ask before any broad scan outside supplied files or before hard reset operations.",
    test_required: "Actually run tests and report the exact CI or local verification command before claiming success.",
    strategy_requires_ratification: "New strategy or constraint text enters configuration only after owner ratification.",
    logs_or_errors: "Do not compress logs, errors, stack trace, stderr, stdout, or build output excerpts.",
    security_policy: "Security policy, CVE status, vulnerability notes, secrets, and permission rules stay explicit.",
  };

  for (const [label, text] of Object.entries(cases)) {
    const path = await tempFile(`${label}.md`, `- ${text}\n- ${text}\n`);
    const report = await auditRules([path], { minChars: 5 });
    assert.equal(report.candidates.length, 1, label);
    assert.equal(report.candidates[0].recommendation, "keep_explicit", label);
    assert.ok(report.candidates[0].risks.includes(label), label);
    assert.equal(report.riskFindings.length, 1, label);
    assert.equal(report.riskSummaries.length, 1, label);
    assert.equal(report.riskSummaries[0].risk, label);
    assert.ok(report.riskFindings[0].risks.includes(label), label);
  }
});
