import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockDir = join(root, "node_modules", ".cache", "rulemeter-build.lock");
const lockParent = dirname(lockDir);
const staleLockMs = 5 * 60 * 1000;
const waitMs = 100;
const maxWaitMs = 60 * 1000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireBuildLock() {
  mkdirSync(lockParent, { recursive: true });
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "owner"), String(process.pid), "utf8");
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let ageMs = 0;
      try {
        ageMs = Date.now() - statSync(lockDir).mtimeMs;
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (ageMs > staleLockMs) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      sleep(waitMs);
    }
  }

  throw new Error("timed out waiting for rulemeter build lock");
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function tscPath() {
  return join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
}

acquireBuildLock();
try {
  run(process.execPath, ["scripts/clean-dist.mjs"]);
  run(tscPath(), []);
  run(process.execPath, ["scripts/mark-bin-executable.mjs"]);
} finally {
  rmSync(lockDir, { recursive: true, force: true });
}
