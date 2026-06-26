import { execFileSync } from "node:child_process";
import { assertPackInventory } from "./pack-inventory.mjs";

const stdout = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
const [pack] = JSON.parse(stdout);

assertPackInventory(pack);
console.log(`pack ok: ${pack.name}@${pack.version} (${pack.entryCount} files)`);
