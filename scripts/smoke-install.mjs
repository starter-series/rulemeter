import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

  const auditOutput = run("npx", ["rulemeter", "audit", "AGENTS.md", "--json", "--min-chars", "10"], { cwd: consumer });
  const audit = JSON.parse(auditOutput);
  if (audit.schemaVersion !== "rulemeter.audit.v2" || audit.candidates.length !== 1 || audit.riskFindings.length !== 1) {
    throw new Error("audit smoke did not return a valid rulemeter.audit.v2 payload");
  }

  console.log(`install smoke ok: ${pack.name}@${pack.version} (${pack.entryCount} files, audit v2)`);
} finally {
  if (process.env.RULEMETER_KEEP_SMOKE_DIR) {
    console.log(`kept smoke directory: ${tempRoot}`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
