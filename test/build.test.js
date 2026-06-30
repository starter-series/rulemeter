import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("concurrent build scripts serialize without corrupting dist", async () => {
  await Promise.all([
    execFileAsync("npm", ["run", "build", "--silent"], { cwd: process.cwd() }),
    execFileAsync("npm", ["run", "build", "--silent"], { cwd: process.cwd() }),
  ]);

  await access("dist/cli.js", constants.X_OK);
  await access("dist/index.js", constants.R_OK);
  const { stdout } = await execFileAsync(process.execPath, ["dist/cli.js", "--version"], { cwd: process.cwd() });
  assert.equal(stdout.trim(), "rulemeter 0.1.0");
});
