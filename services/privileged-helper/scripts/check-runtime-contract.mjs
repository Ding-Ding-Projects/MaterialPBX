import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const original = await readFile(resolve(root, "src/server.ts"), "utf8");
const payloadIdentity = await readFile(resolve(root, "src/payload-identity.ts"), "utf8");
const manifestGenerator = await readFile(resolve(root, "scripts/generate-payload-manifest.mjs"), "utf8");
const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const identifierContract = "const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/);";
const source = process.env.MATERIALPBX_CONTRACT_NEGATIVE === "identifier"
  ? original.replace(identifierContract, "const Identifier = z.string().min(1).max(128);")
  : original;

const requires = (fragment, message) => assert.ok(source.includes(fragment), message);

async function verifyBuiltManifest() {
  const manifest = await readFile(resolve(root, "dist/payload-files.sha256"));
  const text = manifest.toString("utf8");
  assert.ok(text.endsWith("\n"), "Built payload manifest must have a canonical terminal line feed");
  const entries = text.slice(0, -1).split("\n");
  assert.ok(entries.length >= 2, "Built payload manifest must cover package metadata and runtime files");
  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9@][A-Za-z0-9@._/-]*)$/.exec(line);
    assert.ok(match, "Built payload manifest entry must use the canonical digest and path format");
    const observed = createHash("sha256").update(await readFile(resolve(root, ...match[2].split("/")))).digest("hex");
    assert.equal(observed, match[1], `Built payload digest mismatch for ${match[2]}`);
  }
  assert.doesNotMatch(createHash("sha256").update(manifest).digest("hex"), /^0{64}$/, "Installed manifest SHA-256 must not be a placeholder");
}

requires(identifierContract, "Identifiers must begin with an alphanumeric character");
requires("const RequestId = z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);", "Snapshot basenames must derive from lowercase RFC 4122 UUID request IDs");
requires("detached: process.platform !== \"win32\"", "Commands must start in their own Unix process group");
requires("process.kill(-pid, signal)", "Termination must signal the entire Unix process group");
requires("await ensureProcessGroupStopped(child.pid)", "The settle path must await process-group termination");
requires("const maximumConnections = 32;", "Connection concurrency must be bounded");
requires("const requestIdleTimeoutMs = 15_000;", "Request idle time must be bounded");
requires("const maximumRequestBytes = 256 * 1024;", "Request size must be bounded");
requires("const maximumActiveExecutions = 4;", "All command executions must share a concurrency bound");
requires("const maximumQueuedExecutions = 32;", "The execution queue must be bounded");
requires("stdoutBytes <= 1024 * 1024", "Standard output must be bounded by bytes");
requires("stderrBytes <= 256 * 1024", "Standard error must be bounded by bytes");
requires("socket.once(\"close\", () => { releaseConnection(); requestAbort.abort(); });", "Client disconnect must cancel the owned execution");
requires("flag: \"wx\", mode: 0o600", "Desired-state snapshots must be created exclusively");
requires("await chmod(path, 0o400);", "Published desired-state snapshots must be read-only");
requires("Buffer.byteLength(canonical, \"utf8\") > 240 * 1024", "Desired-state snapshots must have a post-canonicalization byte bound");
requires("\"--request-snapshot\", requestSnapshot.path, \"--expected-sha256\", requestSnapshot.digest, \"--expected-revision\", String(requestSnapshot.snapshot.expectedRevision)", "Application commands must carry the immutable snapshot contract");
requires("String(requestSnapshot.snapshot.expectedRevision), \"--deleted\"", "Removal commands must explicitly declare deletion");
requires("expectedRequestBinding: { schemaVersion: 1, action: \"apply\"", "Apply commands must retain the exact expected consumer acknowledgement");
requires("expectedRequestBinding: { schemaVersion: 1, action: \"remove\"", "Removal commands must retain the exact expected consumer acknowledgement");
requires("response.requestBinding) !== canonicalJson(spec.expectedRequestBinding)", "The settle path must reject a mismatched root-consumer acknowledgement");
requires("case \"system.identity\":", "The helper must expose build identity");
requires("case \"system.readiness\":", "The helper must expose readiness facts");
requires("return readiness(abortSignal);", "Readiness probes must share cancellation and execution bounds");
requires(".find(columns => columns[0]?.toLowerCase() === \"materialpbx\")", "Readiness must parse the exact module inventory row");
assert.ok(payloadIdentity.includes("payload-files.sha256"), "Runtime identity must require the installed payload manifest");
assert.ok(payloadIdentity.includes("[A-Za-z0-9@][A-Za-z0-9@._/-]*"), "Runtime identity must accept safe scoped-package manifest paths");
assert.ok(payloadIdentity.includes("facts.uid !== 0") && payloadIdentity.includes("facts.mode & 0o022"), "Runtime identity must verify root ownership and immutable file modes");
assert.ok(payloadIdentity.includes("observedDigest !== expectedDigest"), "Runtime identity must verify every payload entry");
assert.ok(payloadIdentity.includes("protocolVersion: 1") && payloadIdentity.includes("serviceVersion:") && payloadIdentity.includes("installedManifestSha256"), "Runtime identity must report service, protocol, and installed-manifest identity separately");
assert.ok(manifestGenerator.includes("dist/payload-files.sha256") || manifestGenerator.includes("payload-files.sha256"), "The build must generate a deterministic payload manifest");
assert.equal(packageDocument.scripts.build, "node scripts/clean-build-output.mjs && tsc -p tsconfig.json && node scripts/generate-payload-manifest.mjs", "Every build must regenerate its installed payload manifest");
await verifyBuiltManifest();

console.log("PASS: privileged-helper runtime containment contract");
