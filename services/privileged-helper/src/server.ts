import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { chmod, chown, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CapabilityRegistrySchema, FreePbxApplicationRequestSchema, type CapabilityRegistry } from "@materialpbx/protocol";
import { verifyPayloadIdentity } from "./payload-identity.js";

const socketPath = process.env.PRIVILEGED_HELPER_SOCKET ?? "/var/lib/materialpbx-helper/privileged.sock";
const socketGroupText = process.env.MATERIALPBX_SOCKET_GID ?? "";
if (!/^[1-9][0-9]*$/.test(socketGroupText)) throw new Error("MATERIALPBX_SOCKET_GID must be a positive numeric group ID");
const socketGroupId = Number.parseInt(socketGroupText, 10);
if (!Number.isSafeInteger(socketGroupId)) throw new Error("MATERIALPBX_SOCKET_GID is outside the supported numeric range");
const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/);
const RequestId = z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const ApplicationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.enum(["apply", "remove"]),
  resource: FreePbxApplicationRequestSchema,
  expectedRevision: z.number().int().positive()
}).strict().superRefine((snapshot, context) => {
  if (!Identifier.safeParse(snapshot.resource.id).success) context.addIssue({ code: "custom", path: ["resource", "id"], message: "Resource identifier must begin with an alphanumeric character" });
  if (snapshot.expectedRevision !== snapshot.resource.revision) context.addIssue({ code: "custom", path: ["expectedRevision"], message: "Snapshot revision does not match the requested resource revision" });
});
const SnapshotRequestSchema = z.object({ snapshot: ApplicationSnapshotSchema, snapshotSha256: Digest }).strict();
const RequestBindingSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.enum(["apply", "remove"]),
  kind: z.enum(["extensions", "trunks", "inbound-routes", "outbound-routes", "ivrs", "queues", "ring-groups", "voicemail-boxes", "time-conditions"]),
  id: Identifier,
  revision: z.number().int().positive(),
  sha256: Digest
}).strict();
const RequestSchema = z.object({
  requestId: RequestId,
  operation: z.enum([
    "system.identity", "system.readiness", "system.capabilities", "fwconsole.version", "fwconsole.reload",
    "freepbx.application.apply", "freepbx.application.remove", "freepbx.application.rollback", "freepbx.backup.start", "freepbx.backup.status",
    "asterisk.version", "asterisk.module.list", "asterisk.dialplan.reload", "asterisk.callfile.submit"
  ]),
  parameters: z.record(z.string(), z.unknown()).default({})
});

interface CommandSpec { executable: string; args: string[]; timeoutMs: number; cleanupPaths?: string[]; expectedRequestBinding?: z.infer<typeof RequestBindingSchema> }
interface CommandResult { exitCode: number | null; stdout: string; stderr: string; error: string | null }

const requestSnapshotDirectory = "/var/lib/materialpbx-helper/requests";
const maximumRequestBytes = 256 * 1024;
const maximumConnections = 32;
const requestIdleTimeoutMs = 15_000;
const maximumActiveExecutions = 4;
const maximumQueuedExecutions = 32;
const BUILD_INFO = await verifyPayloadIdentity();

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

async function createImmutableSnapshot(requestId: string, parameters: unknown, expectedAction: "apply" | "remove") {
  const parsed = SnapshotRequestSchema.parse(parameters);
  if (parsed.snapshot.action !== expectedAction) throw new Error(`Desired-state snapshot action must be ${expectedAction}`);
  const canonical = canonicalJson(parsed.snapshot);
  if (sha256(canonical) !== parsed.snapshotSha256) throw new Error("Desired-state snapshot digest did not match the supplied SHA-256");
  if (Buffer.byteLength(canonical, "utf8") > 240 * 1024) throw new Error("Desired-state snapshot exceeded its 240 KiB canonical-byte limit");
  await mkdir(requestSnapshotDirectory, { recursive: true, mode: 0o700 });
  const directory = await lstat(requestSnapshotDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 || (directory.mode & 0o077) !== 0) {
    throw new Error("Privileged-helper request snapshot directory is not a trusted root-owned directory");
  }
  const path = join(requestSnapshotDirectory, `${requestId}.json`);
  try {
    await writeFile(path, canonical, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await chmod(path, 0o400);
    const written = await lstat(path);
    if (!written.isFile() || written.isSymbolicLink() || written.uid !== 0 || (written.mode & 0o777) !== 0o400) throw new Error("Snapshot ownership or mode check failed");
  } catch (error) {
    await rm(path, { force: true });
    throw new Error(`Privileged-helper request snapshot could not be published safely: ${error instanceof Error ? error.name : "unknown failure"}`);
  }
  return { path, digest: parsed.snapshotSha256, snapshot: parsed.snapshot };
}

async function commandFor(request: z.infer<typeof RequestSchema>): Promise<CommandSpec | null> {
  const p = request.parameters;
  switch (request.operation) {
    case "system.identity":
    case "system.readiness":
    case "system.capabilities": return null;
    case "fwconsole.version": return { executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 15_000 };
    case "fwconsole.reload": return { executable: "/usr/sbin/fwconsole", args: ["reload", "--quiet"], timeoutMs: 120_000 };
    case "asterisk.version": return { executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 10_000 };
    case "asterisk.module.list": return { executable: "/usr/sbin/asterisk", args: ["-rx", "module show"], timeoutMs: 20_000 };
    case "asterisk.dialplan.reload": return { executable: "/usr/sbin/asterisk", args: ["-rx", "dialplan reload"], timeoutMs: 30_000 };
    case "freepbx.application.apply": {
      const requestSnapshot = await createImmutableSnapshot(request.requestId, p, "apply");
      const application = requestSnapshot.snapshot.resource;
      const kindByFeature = { extension: "extensions", trunk: "trunks", "inbound-route": "inbound-routes", "outbound-route": "outbound-routes", ivr: "ivrs", queue: "queues", "ring-group": "ring-groups", voicemail: "voicemail-boxes", "time-condition": "time-conditions" } as const;
      return {
        executable: "/usr/sbin/fwconsole",
        args: ["materialpbx", "--operation", "sync", "--kind", kindByFeature[application.feature], "--id", application.id, "--request-snapshot", requestSnapshot.path, "--expected-sha256", requestSnapshot.digest, "--expected-revision", String(requestSnapshot.snapshot.expectedRevision)],
        timeoutMs: 60_000,
        cleanupPaths: [requestSnapshot.path],
        expectedRequestBinding: { schemaVersion: 1, action: "apply", kind: kindByFeature[application.feature], id: application.id, revision: requestSnapshot.snapshot.expectedRevision, sha256: requestSnapshot.digest }
      };
    }
    case "freepbx.application.remove": {
      const requestSnapshot = await createImmutableSnapshot(request.requestId, p, "remove");
      const application = requestSnapshot.snapshot.resource;
      const kindByFeature = { extension: "extensions", trunk: "trunks", "inbound-route": "inbound-routes", "outbound-route": "outbound-routes", ivr: "ivrs", queue: "queues", "ring-group": "ring-groups", voicemail: "voicemail-boxes", "time-condition": "time-conditions" } as const;
      return {
        executable: "/usr/sbin/fwconsole",
        args: ["materialpbx", "--operation", "sync", "--kind", kindByFeature[application.feature], "--id", application.id, "--request-snapshot", requestSnapshot.path, "--expected-sha256", requestSnapshot.digest, "--expected-revision", String(requestSnapshot.snapshot.expectedRevision), "--deleted"],
        timeoutMs: 60_000,
        cleanupPaths: [requestSnapshot.path],
        expectedRequestBinding: { schemaVersion: 1, action: "remove", kind: kindByFeature[application.feature], id: application.id, revision: requestSnapshot.snapshot.expectedRevision, sha256: requestSnapshot.digest }
      };
    }
    case "freepbx.application.rollback": {
      const snapshotId = z.string().uuid().parse(p.snapshotId);
      return { executable: "/usr/sbin/fwconsole", args: ["materialpbx", "--operation", "rollback-compiler", "--snapshot-id", snapshotId], timeoutMs: 60_000 };
    }
    case "freepbx.backup.start": {
      const id = Identifier.parse(p.id);
      return { executable: "/usr/sbin/fwconsole", args: ["backup", "--backup", id], timeoutMs: 300_000 };
    }
    case "freepbx.backup.status": return { executable: "/usr/sbin/fwconsole", args: ["backup", "--list"], timeoutMs: 30_000 };
    case "asterisk.callfile.submit": {
      const id = Identifier.parse(p.id);
      return { executable: "/usr/sbin/fwconsole", args: ["materialpbx", "--operation", "submit-call-file", "--id", id], timeoutMs: 30_000 };
    }
  }
}

interface ExecutionWaiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

let activeExecutions = 0;
const executionWaiters: ExecutionWaiter[] = [];

function releaseExecution() {
  activeExecutions -= 1;
  while (activeExecutions < maximumActiveExecutions && executionWaiters.length > 0) {
    const waiter = executionWaiters.shift()!;
    if (waiter.signal?.aborted) continue;
    if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
    activeExecutions += 1;
    let released = false;
    waiter.resolve(() => { if (!released) { released = true; releaseExecution(); } });
  }
}

function acquireExecution(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error("Request was cancelled before execution"), { code: "REQUEST_CANCELLED" }));
  if (activeExecutions < maximumActiveExecutions) {
    activeExecutions += 1;
    let released = false;
    return Promise.resolve(() => { if (!released) { released = true; releaseExecution(); } });
  }
  if (executionWaiters.length >= maximumQueuedExecutions) {
    return Promise.reject(Object.assign(new Error("The privileged-helper execution queue is full"), { code: "QUEUE_FULL" }));
  }
  return new Promise((resolve, reject) => {
    const waiter: ExecutionWaiter = { resolve, reject, signal };
    waiter.onAbort = () => {
      const index = executionWaiters.indexOf(waiter);
      if (index >= 0) executionWaiters.splice(index, 1);
      reject(Object.assign(new Error("Request was cancelled while waiting for execution"), { code: "REQUEST_CANCELLED" }));
    };
    signal?.addEventListener("abort", waiter.onAbort, { once: true });
    executionWaiters.push(waiter);
  });
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    if (process.platform === "win32") process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function processGroupExists(pid: number): boolean {
  try {
    if (process.platform === "win32") process.kill(pid, 0);
    else process.kill(-pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function ensureProcessGroupStopped(pid: number): Promise<string | null> {
  if (!processGroupExists(pid)) return null;
  signalProcessGroup(pid, "SIGKILL");
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!processGroupExists(pid)) return null;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return "The command process group did not terminate within the cleanup deadline";
}

async function runCommand(spec: CommandSpec, abortSignal?: AbortSignal): Promise<CommandResult> {
  let release: (() => void) | null = null;
  try {
    release = await acquireExecution(abortSignal);
    return await new Promise(resolve => {
      const child = spawn(spec.executable, spec.args, {
        shell: false,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", HOME: "/root", USER: "root", LOGNAME: "root", TMPDIR: "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }
      });
      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let terminationReason: string | null = null;
      let spawnError: Error | null = null;
      let settled = false;
      const terminate = (reason: string) => {
        if (terminationReason) return;
        terminationReason = reason;
        if (child.pid) signalProcessGroup(child.pid, "SIGKILL");
      };
      const timer = setTimeout(() => terminate("Command exceeded its execution deadline"), spec.timeoutMs);
      const onAbort = () => terminate("Command was cancelled because the client disconnected");
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes <= 1024 * 1024) stdout += chunk;
        else terminate("Command output exceeded the configured stdout limit");
      });
      child.stderr.on("data", chunk => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes <= 256 * 1024) stderr += chunk;
        else terminate("Command output exceeded the configured stderr limit");
      });
      child.once("error", error => { spawnError = error; });
      child.once("close", (code, signal) => {
        void (async () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abortSignal?.removeEventListener("abort", onAbort);
          const groupError = child.pid ? await ensureProcessGroupStopped(child.pid) : null;
          let bindingError: string | null = null;
          if (!terminationReason && !groupError && !spawnError && !signal && code === 0 && spec.expectedRequestBinding) {
            try {
              const response = z.object({ requestBinding: RequestBindingSchema }).passthrough().parse(JSON.parse(stdout));
              if (canonicalJson(response.requestBinding) !== canonicalJson(spec.expectedRequestBinding)) bindingError = "The root consumer confirmed a different desired-state request binding";
            } catch { bindingError = "The root consumer did not return a valid desired-state request binding"; }
          }
          const error = terminationReason ?? groupError ?? spawnError?.message ?? (signal ? `Command terminated by ${signal}` : null) ?? bindingError;
          resolve({ exitCode: code, stdout, stderr, error });
        })();
      });
    });
  } finally {
    release?.();
    await Promise.all((spec.cleanupPaths ?? []).map(path => rm(path, { force: true })));
  }
}

async function capabilities(abortSignal?: AbortSignal): Promise<CommandResult> {
  const observedAt = new Date().toISOString();
  const probes = await Promise.all([
    runCommand({ executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 15_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 10_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "module show"], timeoutMs: 20_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show transports"], timeoutMs: 15_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show endpoints"], timeoutMs: 15_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show registrations"], timeoutMs: 15_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "manager show settings"], timeoutMs: 15_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "ari show status"], timeoutMs: 15_000 }, abortSignal)
  ]);
  const [freepbx, asterisk, modules, transports, endpoints, registrations, manager, ari] = probes;
  let availableFiles = new Set<string>();
  let moduleDirectoryError: string | null = null;
  try { availableFiles = new Set(await readdir("/usr/lib/asterisk/modules")); }
  catch (error) { moduleDirectoryError = error instanceof Error ? error.message : "Module directory unavailable"; }
  const loadedText = modules.exitCode === 0 ? modules.stdout.toLowerCase() : "";
  const entries: CapabilityRegistry["capabilities"] = [];
  const evidence = (source: "asterisk-cli" | "fwconsole" | "module-runtime" | "module-filesystem", summary: string, facts: Record<string, string | number | boolean | null> = {}) => [{ source, observedAt, summary, facts }];
  const platform = (id: string, result: CommandResult, source: "asterisk-cli" | "fwconsole") => entries.push({ id, category: "platform", state: result.exitCode === 0 ? "running" : "unknown", reason: result.exitCode === 0 ? "The platform answered its version probe." : "The version probe did not complete successfully; absence was not inferred.", evidence: evidence(source, result.exitCode === 0 ? result.stdout.trim().slice(0, 512) : "Version probe failed", { exitCode: result.exitCode }) });
  platform("platform.freepbx", freepbx, "fwconsole");
  platform("platform.asterisk", asterisk, "asterisk-cli");
  const modulesFor = (names: string[]) => ({ loaded: names.filter(name => loadedText.includes(name.toLowerCase())), installed: names.filter(name => availableFiles.has(name)) });
  const moduleCapability = (id: string, category: z.infer<typeof CapabilityRegistrySchema>["capabilities"][number]["category"], names: string[], configured = false, configuredEvidence?: CommandResult) => {
    const found = modulesFor(names);
    const probeFailed = modules.exitCode !== 0;
    const fullyLoaded = found.loaded.length === names.length;
    const isConfigured = fullyLoaded && configured;
    const state = isConfigured ? "configured" : fullyLoaded ? "running" : found.installed.length === names.length ? "installed" : probeFailed || moduleDirectoryError ? "unknown" : "unavailable";
    const reason = isConfigured ? "The required modules are loaded and Asterisk reported configured objects." : state === "running" ? "Every required module is loaded, but configuration evidence was not observed." : state === "installed" ? "Module files exist, but they were not observed loaded." : state === "unavailable" ? "One or more required module files were not found and were not loaded." : "Evidence collection was degraded; missing evidence was not treated as absence.";
    const items = [...evidence("module-runtime", `Loaded ${found.loaded.length} of ${names.length} required modules.`, { required: names.join(","), loaded: found.loaded.join(","), probeExitCode: modules.exitCode }), ...evidence("module-filesystem", `Found ${found.installed.length} of ${names.length} required module files.`, { installed: found.installed.join(","), directoryReadable: !moduleDirectoryError })];
    if (configuredEvidence) items.push(...evidence("asterisk-cli", "Configuration inventory probe completed.", { exitCode: configuredEvidence.exitCode, outputBytes: Buffer.byteLength(configuredEvidence.stdout) }));
    entries.push({ id, category, state, reason, evidence: items });
  };
  const hasObjects = (result: CommandResult) => result.exitCode === 0 && !/Objects found:\s*0/i.test(result.stdout) && result.stdout.trim().length > 0;
  moduleCapability("interface.ami", "interface", ["manager.so"], manager.exitCode === 0 && /Enabled:\s*Yes/i.test(manager.stdout), manager);
  moduleCapability("interface.ari", "interface", ["res_ari.so"], ari.exitCode === 0 && /Enabled/i.test(ari.stdout) && !/Disabled/i.test(ari.stdout), ari);
  moduleCapability("signaling.pjsip-transports", "signaling", ["res_pjsip.so"], hasObjects(transports), transports);
  moduleCapability("signaling.pjsip-endpoints", "signaling", ["res_pjsip.so"], hasObjects(endpoints), endpoints);
  moduleCapability("signaling.pjsip-registrations", "signaling", ["res_pjsip_outbound_registration.so"], hasObjects(registrations), registrations);
  moduleCapability("telephony.core", "telephony", ["app_dial.so", "pbx_config.so"]);
  moduleCapability("media.recording", "media", ["app_mixmonitor.so"]);
  moduleCapability("records.cdr", "records", ["cdr_manager.so"]);
  moduleCapability("records.cel", "records", ["cel_manager.so"]);
  moduleCapability("telephony.queue", "telephony", ["app_queue.so"]);
  moduleCapability("telephony.conference", "telephony", ["app_confbridge.so"]);
  moduleCapability("telephony.parking", "telephony", ["res_parking.so"]);
  moduleCapability("telephony.paging", "telephony", ["app_page.so"]);
  moduleCapability("telephony.voicemail", "telephony", ["app_voicemail.so"]);
  moduleCapability("media.webrtc", "media", ["res_http_websocket.so", "res_pjsip_transport_websocket.so"]);
  moduleCapability("media.external-media", "media", ["res_ari_channels.so"]);
  moduleCapability("security.stir-shaken", "security", ["res_stir_shaken.so"]);
  moduleCapability("signaling.geolocation", "signaling", ["res_geolocation.so"]);
  moduleCapability("hardware.dahdi", "hardware", ["chan_dahdi.so"]);
  moduleCapability("signaling.iax2", "signaling", ["chan_iax2.so"]);
  const warnings = probes.flatMap((probe, index) => probe.exitCode === 0 ? [] : [`Probe ${index + 1} did not complete successfully.`]);
  if (moduleDirectoryError) warnings.push("The Asterisk module directory could not be read; installed-module states are unknown where runtime evidence is absent.");
  const report = CapabilityRegistrySchema.parse({ schemaVersion: 1, generatedAt: observedAt, degraded: warnings.length > 0, warnings, capabilities: entries });
  return { exitCode: 0, stdout: JSON.stringify(report), stderr: "", error: null };
}

function identity(): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, build: BUILD_INFO }), stderr: "", error: null };
}

async function readiness(abortSignal?: AbortSignal): Promise<CommandResult> {
  const [freepbx, asterisk, moduleInventory] = await Promise.all([
    runCommand({ executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 8_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 8_000 }, abortSignal),
    runCommand({ executable: "/usr/sbin/fwconsole", args: ["ma", "list"], timeoutMs: 8_000 }, abortSignal)
  ]);
  const moduleRow = `${moduleInventory.stdout}\n${moduleInventory.stderr}`
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map(line => line.split("|").map(value => value.trim()).filter(Boolean))
    .find(columns => columns[0]?.toLowerCase() === "materialpbx") ?? null;
  const moduleStatus = moduleRow?.[2] ?? null;
  const facts = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    build: BUILD_INFO,
    helper: { ready: true },
    freepbx: { ready: freepbx.exitCode === 0 && !freepbx.error, versionObserved: freepbx.exitCode === 0 },
    asterisk: { ready: asterisk.exitCode === 0 && !asterisk.error, versionObserved: asterisk.exitCode === 0 },
    materialpbxModule: {
      ready: moduleInventory.exitCode === 0 && !moduleInventory.error && moduleStatus?.toLowerCase() === "enabled",
      inventoryObserved: moduleInventory.exitCode === 0 && !moduleInventory.error,
      name: moduleRow?.[0] ?? null,
      version: moduleRow?.[1] ?? null,
      status: moduleStatus
    }
  };
  const ready = facts.freepbx.ready && facts.asterisk.ready && facts.materialpbxModule.ready;
  return { exitCode: ready ? 0 : 1, stdout: JSON.stringify({ ...facts, ready }), stderr: "", error: null };
}

async function handle(line: string, abortSignal?: AbortSignal) {
  const request = RequestSchema.parse(JSON.parse(line));
  const execute = async () => {
    if (request.operation === "system.identity") return identity();
    if (request.operation === "system.readiness") return readiness(abortSignal);
    if (request.operation === "system.capabilities") return capabilities(abortSignal);
    const command = await commandFor(request);
    if (!command) throw new Error("The requested operation did not resolve to an executable command");
    return runCommand(command, abortSignal);
  };
  const result = mutatingOperations.has(request.operation) ? await serializeMutation(execute) : await execute();
  return {
    requestId: request.requestId,
    ok: result.exitCode === 0 && !result.error,
    ...result
  };
}

const mutatingOperations = new Set([
  "fwconsole.reload",
  "freepbx.application.apply",
  "freepbx.application.remove",
  "freepbx.application.rollback",
  "freepbx.backup.start",
  "asterisk.dialplan.reload",
  "asterisk.callfile.submit"
]);
let mutationTail: Promise<void> = Promise.resolve();
let queuedMutations = 0;
async function serializeMutation<T>(action: () => Promise<T>): Promise<T> {
  if (queuedMutations >= 16) throw Object.assign(new Error("The privileged-helper mutation queue is full"), { code: "QUEUE_FULL" });
  queuedMutations += 1;
  const prior = mutationTail;
  let release!: () => void;
  mutationTail = new Promise<void>(resolve => { release = resolve; });
  await prior;
  try { return await action(); }
  finally { queuedMutations -= 1; release(); }
}

await mkdir(dirname(socketPath), { recursive: true, mode: 0o750 });
await rm(socketPath, { force: true });
let ready = false;
let activeConnections = 0;
const server = createServer(socket => {
  if (!ready) {
    socket.end(`${JSON.stringify({ requestId: "00000000-0000-0000-0000-000000000000", ok: false, exitCode: null, stdout: "", stderr: "", error: "Privileged helper is still publishing its socket permissions" })}\n`);
    return;
  }
  if (activeConnections >= maximumConnections) {
    socket.end(`${JSON.stringify({ requestId: "00000000-0000-0000-0000-000000000000", ok: false, exitCode: null, stdout: "", stderr: "", error: "Privileged helper connection limit reached" })}\n`);
    return;
  }
  activeConnections += 1;
  let connectionReleased = false;
  const releaseConnection = () => {
    if (connectionReleased) return;
    connectionReleased = true;
    activeConnections -= 1;
  };
  const requestAbort = new AbortController();
  socket.once("close", () => { releaseConnection(); requestAbort.abort(); });
  socket.once("error", () => requestAbort.abort());
  socket.setTimeout(requestIdleTimeoutMs);
  socket.setEncoding("utf8");
  let buffer = "";
  let receivedBytes = 0;
  let handled = false;
  socket.once("timeout", () => {
    if (handled) return;
    handled = true;
    requestAbort.abort();
    socket.end(`${JSON.stringify({ requestId: safeRequestId(buffer), ok: false, exitCode: null, stdout: "", stderr: "", error: "Request did not arrive before the idle deadline" })}\n`);
  });
  socket.on("data", async chunk => {
    if (handled) return;
    receivedBytes += Buffer.byteLength(chunk);
    buffer += chunk;
    if (receivedBytes > maximumRequestBytes) { handled = true; requestAbort.abort(); socket.end(`${JSON.stringify({ requestId: "00000000-0000-0000-0000-000000000000", ok: false, exitCode: null, stdout: "", stderr: "", error: "Request exceeded 256 KiB" })}\n`); return; }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    handled = true;
    socket.setTimeout(0);
    try {
      if (buffer.slice(newline + 1).trim()) throw new Error("Only one request is accepted per privileged-helper connection");
      const result = await handle(buffer.slice(0, newline), requestAbort.signal);
      if (!socket.destroyed) socket.end(`${JSON.stringify(result)}\n`);
    }
    catch (error) {
      const message = (error instanceof Error ? error.message : "Invalid request").slice(0, 2048);
      if (!socket.destroyed) socket.end(`${JSON.stringify({ requestId: safeRequestId(buffer), ok: false, exitCode: null, stdout: "", stderr: "", error: message })}\n`);
    }
  });
});
server.maxConnections = maximumConnections;
server.listen(socketPath, () => {
  void (async () => {
    await chmod(socketPath, 0o660);
    await chown(socketPath, 0, socketGroupId);
    ready = true;
  })().catch(error => {
    console.error(`Could not publish privileged-helper socket permissions: ${error instanceof Error ? error.message : "unknown error"}`);
    server.close(() => process.exit(1));
  });
});

function safeRequestId(input: string): string {
  try { return RequestId.parse(JSON.parse(input).requestId); }
  catch { return "00000000-0000-0000-0000-000000000000"; }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close(() => process.exit(0)));
