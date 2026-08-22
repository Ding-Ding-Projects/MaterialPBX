import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const expectedService = "@materialpbx/control-plane";
const manifestLine = /^([a-f0-9]{64})  ([A-Za-z0-9@][A-Za-z0-9@._/-]*)$/;

async function requireRootOwnedPath(serviceRoot: string, relativePath: string) {
  const segments = relativePath.split("/");
  let path = serviceRoot;
  for (let index = 0; index < segments.length; index += 1) {
    path = resolve(path, segments[index]);
    const facts = await lstat(path);
    const final = index === segments.length - 1;
    if (facts.isSymbolicLink() || facts.uid !== 0 || (facts.mode & 0o022) !== 0 || (final ? !facts.isFile() : !facts.isDirectory())) {
      throw new Error("The installed payload contains a path outside the root-owned immutable boundary");
    }
  }
  return path;
}

export async function verifyPayloadIdentity() {
  const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rootFacts = await lstat(serviceRoot);
  if (!rootFacts.isDirectory() || rootFacts.isSymbolicLink() || rootFacts.uid !== 0 || (rootFacts.mode & 0o022) !== 0) {
    throw new Error("The installed service package directory is not root-owned and immutable");
  }
  const manifestPath = resolve(serviceRoot, "dist", "payload-files.sha256");
  await requireRootOwnedPath(serviceRoot, "dist/payload-files.sha256");
  const manifestBytes = await readFile(manifestPath);
  const manifestText = manifestBytes.toString("utf8");
  if (!manifestText.endsWith("\n")) throw new Error("The installed payload manifest is not canonically terminated");
  const seen = new Set<string>();
  let previousPath = "";
  for (const line of manifestText.slice(0, -1).split("\n")) {
    const match = manifestLine.exec(line);
    if (!match) throw new Error("The installed payload manifest contains an invalid entry");
    const [, expectedDigest, relativePath] = match;
    const segments = relativePath.split("/");
    if (seen.has(relativePath) || relativePath.includes("//") || segments.includes(".") || segments.includes("..") || (previousPath && relativePath <= previousPath)) throw new Error("The installed payload manifest contains a duplicate, unsorted, or unsafe path");
    seen.add(relativePath);
    previousPath = relativePath;
    const path = resolve(serviceRoot, ...relativePath.split("/"));
    if (!path.startsWith(`${serviceRoot}${sep}`) || path === manifestPath) throw new Error("The installed payload manifest path escaped its package boundary");
    await requireRootOwnedPath(serviceRoot, relativePath);
    const observedDigest = createHash("sha256").update(await readFile(path)).digest("hex");
    if (observedDigest !== expectedDigest) throw new Error("An installed payload file did not match its manifest digest");
  }
  if (!seen.has("package.json") || !seen.has("dist/server.js") || seen.size < 2) throw new Error("The installed payload manifest is incomplete");
  const packageDocument = JSON.parse(await readFile(resolve(serviceRoot, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
  if (packageDocument.name !== expectedService || typeof packageDocument.version !== "string" || !packageDocument.version) throw new Error("The installed package metadata did not match the service identity");
  const installedManifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  if (/^0{64}$/.test(installedManifestSha256)) throw new Error("The installed payload manifest digest is an invalid placeholder");
  return Object.freeze({
    service: expectedService,
    serviceVersion: packageDocument.version,
    protocolVersion: 1,
    readinessSchemaVersion: 1,
    desiredStateSnapshotSchemaVersion: 1,
    installedManifestSha256
  } as const);
}
