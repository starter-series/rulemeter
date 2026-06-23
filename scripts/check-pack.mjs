import { execFileSync } from "node:child_process";

const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [pack] = JSON.parse(stdout);
if (!pack || !Array.isArray(pack.files)) {
  throw new Error("npm pack did not return a file list");
}

const files = new Map(pack.files.map((file) => [file.path, file]));
const required = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts", "dist/cli.js", "dist/cli.d.ts"];
for (const path of required) {
  if (!files.has(path)) throw new Error(`missing packed file: ${path}`);
}

const forbiddenPrefixes = ["src/", "test/", "fixtures/", "scripts/", ".github/"];
for (const path of files.keys()) {
  if (forbiddenPrefixes.some((prefix) => path.startsWith(prefix))) {
    throw new Error(`unexpected packed file: ${path}`);
  }
}

const cli = files.get("dist/cli.js");
if (cli?.mode !== 0o755) {
  throw new Error(`dist/cli.js must be executable; got mode ${cli?.mode ?? "missing"}`);
}

console.log(`pack ok: ${pack.name}@${pack.version} (${pack.entryCount} files)`);
