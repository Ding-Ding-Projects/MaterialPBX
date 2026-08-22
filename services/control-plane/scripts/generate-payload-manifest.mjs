import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distributionRoot = join(serviceRoot, "dist");
const manifestPath = join(distributionRoot, "payload-files.sha256");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path);
    if (!entry.isFile() || path === manifestPath) return [];
    return [path];
  }));
  return nested.flat();
}

const files = [join(serviceRoot, "package.json"), ...(await filesBelow(distributionRoot))]
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const lines = [];
for (const path of files) {
  const digest = createHash("sha256").update(await readFile(path)).digest("hex");
  lines.push(`${digest}  ${relative(serviceRoot, path).replaceAll("\\", "/")}`);
}
await writeFile(manifestPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o644 });
