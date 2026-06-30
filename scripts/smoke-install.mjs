import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPackInventory } from "./pack-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "rulemeter-install-smoke-"));

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "inherit"],
  });
}

try {
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", tempRoot]);
  const [pack] = JSON.parse(packOutput);
  if (!pack?.filename) throw new Error("npm pack did not return a filename");
  assertPackInventory(pack);

  const tarballPath = join(tempRoot, pack.filename);
  const consumer = join(tempRoot, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));

  run("npm", ["install", "--ignore-scripts", tarballPath], { cwd: consumer, stdio: "inherit" });

  const version = run("npx", ["rulemeter", "--version"], { cwd: consumer }).trim();
  if (version !== `${pack.name} ${pack.version}`) {
    throw new Error(`unexpected CLI version: ${version}`);
  }

  writeFileSync(
    join(consumer, "AGENTS.md"),
    "- Preserve existing module boundaries.\n- Preserve existing module boundaries.\n- Actually run tests before claiming success.\n",
    "utf8",
  );
  writeFileSync(join(consumer, "CLAUDE.md"), "@AGENTS.md\n", "utf8");

  const auditOutput = run("npx", ["rulemeter", "audit", "AGENTS.md", "--json", "--min-chars", "10"], { cwd: consumer });
  const audit = JSON.parse(auditOutput);
  if (audit.schemaVersion !== "rulemeter.audit.v2" || audit.candidates.length !== 1 || audit.riskFindings.length !== 1) {
    throw new Error("audit smoke did not return a valid rulemeter.audit.v2 payload");
  }

  const sourcesOutput = run("npx", ["rulemeter", "sources", "--json"], { cwd: consumer });
  const sources = JSON.parse(sourcesOutput);
  if (sources.schemaVersion !== "rulemeter.sources.v1" || sources.sourceStrategy !== "single_source") {
    throw new Error("sources smoke did not return a valid rulemeter.sources.v1 single_source payload");
  }

  writeFileSync(join(consumer, "GEMINI.md"), "- Gemini keeps a local override for this consumer smoke.\n", "utf8");
  const decisionsOutput = run("npx", ["rulemeter", "decisions", "--json"], { cwd: consumer });
  const decisions = JSON.parse(decisionsOutput);
  if (decisions.schemaVersion !== "rulemeter.decisions.v1" || decisions.counts.pending !== 1) {
    throw new Error("decisions smoke did not return a pending rulemeter.decisions.v1 payload");
  }
  const acceptedOutput = run("npx", ["rulemeter", "decisions", "--accept", "all", "--json"], { cwd: consumer });
  const accepted = JSON.parse(acceptedOutput);
  if (accepted.schemaVersion !== "rulemeter.decisions.v1" || accepted.counts.accepted !== 1 || accepted.counts.pending !== 0) {
    throw new Error("decisions smoke did not accept current source warnings");
  }

  const queueOutput = run("npx", ["rulemeter", "queue", "--json", "--min-chars", "10"], { cwd: consumer });
  const queue = JSON.parse(queueOutput);
  if (queue.schemaVersion !== "rulemeter.queue.v1" || queue.counts.byKind.decision !== 0 || queue.counts.byKind.duplicate !== 1) {
    throw new Error("queue smoke did not return a valid rulemeter.queue.v1 payload");
  }

  console.log(`install smoke ok: ${pack.name}@${pack.version} (${pack.entryCount} files, audit v2, sources v1, decisions v1, queue v1)`);
} finally {
  if (process.env.RULEMETER_KEEP_SMOKE_DIR) {
    console.log(`kept smoke directory: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
