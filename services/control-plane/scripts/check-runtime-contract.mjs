import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverOriginal = await readFile(resolve(root, "src/server.ts"), "utf8");
const freepbx = await readFile(resolve(root, "src/adapters/freepbx.ts"), "utf8");
const privileged = await readFile(resolve(root, "src/adapters/privileged.ts"), "utf8");
const cdr = await readFile(resolve(root, "src/adapters/cdr.ts"), "utf8");
const ami = await readFile(resolve(root, "src/adapters/ami.ts"), "utf8");
const ari = await readFile(resolve(root, "src/adapters/ari.ts"), "utf8");
const payloadIdentity = await readFile(resolve(root, "src/payload-identity.ts"), "utf8");
const manifestGenerator = await readFile(resolve(root, "scripts/generate-payload-manifest.mjs"), "utf8");
const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const identifierContract = "const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/);";
const server = process.env.MATERIALPBX_CONTRACT_NEGATIVE === "identifier"
  ? serverOriginal.replace(identifierContract, "const Identifier = z.string().min(1).max(128);")
  : serverOriginal;

const includes = (text, fragment, message) => assert.ok(text.includes(fragment), message);

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

includes(server, identifierContract, "Route identifiers must begin with an alphanumeric character");
includes(server, "const pathname = request.url.split(\"?\", 1)[0];", "Authentication exemptions must compare pathnames rather than raw URLs");
includes(server, "if (pathname === \"/healthz\" || pathname === \"/v1/federation/messages\") return;", "Only cheap liveness and the separately authenticated federation transport may bypass administrator authentication");
assert.ok(!server.match(/request\.url === ["']\/readyz["']/), "Readiness must require administrator authentication");
includes(server, "server.get(\"/readyz\"", "The control plane must expose a distinct readiness endpoint");
includes(server, "await Promise.allSettled([", "Readiness probes must preserve every structured outcome");
includes(server, "withReadinessDeadline(\"privileged helper\", 20_000", "Helper readiness must settle below the HTTP request deadline");
includes(server, "helper.readiness()", "Readiness must probe the privileged helper");
includes(server, "withReadinessDeadline(\"database\", 8_000, () => records.probe())", "Readiness must probe the database within a bounded deadline");
includes(server, "withReadinessDeadline(\"AMI\", 8_000, () => ami.probe())", "Readiness must probe AMI within a bounded deadline");
includes(server, "withReadinessDeadline(\"ARI\", 8_000, () => ari.probe())", "Readiness must probe ARI within a bounded deadline");
includes(server, "module: { ...(helperReady?.materialpbxModule", "Readiness must report module facts explicitly");
includes(server, "runtime: {", "Readiness must report runtime facts explicitly");
includes(server, "compatibility = {", "Readiness must report service and protocol compatibility explicitly");
includes(server, "server.log.error({ adapter: \"freepbx-database\", failure: recordsInitializationFailure }", "Database initialization detail must be logged in a safely redacted form");
includes(cdr, "await this.probe();", "Database initialization must verify a live query");
includes(cdr, "query(\"SELECT 1\")", "Database readiness must execute a bounded probe query");
includes(ami, "async probe(): Promise<void>", "AMI must implement a runtime readiness probe");
includes(ami, "AmiPingResponseSchema.safeParse", "AMI readiness must validate the exact Ping response shape");
includes(ari, "async probe(): Promise<void>", "ARI must implement a runtime readiness probe");
includes(ari, "AriAsteriskInfoSchema.parse(response)", "ARI readiness must validate the Asterisk information response shape");
includes(freepbx, "snapshotSha256: createHash(\"sha256\")", "Application mutations must send a desired-state snapshot digest");
includes(freepbx, "expectedRevision: resource.revision", "Application mutations must bind the exact desired-state revision");
includes(freepbx, "requestBinding: RequestBindingSchema", "The control plane must require the root consumer's exact request binding");
includes(freepbx, "canonicalJson(bridge.requestBinding) !== canonicalJson(expected)", "The control plane must reject a mismatched root-consumer acknowledgement");
includes(privileged, "system.identity", "The helper client must support build attestation");
includes(privileged, "system.readiness", "The helper client must support explicit readiness");
assert.ok(payloadIdentity.includes("payload-files.sha256"), "Runtime identity must require the installed payload manifest");
assert.ok(payloadIdentity.includes("[A-Za-z0-9@][A-Za-z0-9@._/-]*"), "Runtime identity must accept safe scoped-package manifest paths");
assert.ok(payloadIdentity.includes("facts.uid !== 0") && payloadIdentity.includes("facts.mode & 0o022"), "Runtime identity must verify root ownership and immutable file modes");
assert.ok(payloadIdentity.includes("observedDigest !== expectedDigest"), "Runtime identity must verify every payload entry");
assert.ok(payloadIdentity.includes("protocolVersion: 1") && payloadIdentity.includes("serviceVersion:") && payloadIdentity.includes("installedManifestSha256"), "Runtime identity must report service, protocol, and installed-manifest identity separately");
assert.ok(manifestGenerator.includes("payload-files.sha256"), "The build must generate a deterministic payload manifest");
assert.equal(packageDocument.scripts.build, "node scripts/clean-build-output.mjs && tsc -p tsconfig.json && node scripts/generate-payload-manifest.mjs", "Every build must regenerate its installed payload manifest");
await verifyBuiltManifest();

console.log("PASS: control-plane readiness and attestation contract");
