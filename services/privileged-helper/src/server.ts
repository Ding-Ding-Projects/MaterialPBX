import { createServer } from "node:net";
import { chmod, chown, mkdir, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { z } from "zod";
import { CapabilityRegistrySchema, resourceKinds, type CapabilityRegistry } from "@materialpbx/protocol";

const socketPath = process.env.PRIVILEGED_HELPER_SOCKET ?? "/run/materialpbx/privileged.sock";
const socketGroupId = Number.parseInt(process.env.MATERIALPBX_SOCKET_GID ?? "0", 10);
const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@+-]+$/);
const RequestSchema = z.object({
  requestId: z.string().uuid(),
  operation: z.enum([
    "system.capabilities", "fwconsole.version", "fwconsole.reload", "fwconsole.status",
    "freepbx.resource.sync", "freepbx.backup.start", "freepbx.backup.status",
    "asterisk.version", "asterisk.module.list", "asterisk.dialplan.reload", "asterisk.callfile.submit"
  ]),
  parameters: z.record(z.string(), z.unknown()).default({})
});

interface CommandSpec { executable: string; args: string[]; timeoutMs: number }
interface CommandResult { exitCode: number | null; stdout: string; stderr: string; error: string | null }

function commandFor(request: z.infer<typeof RequestSchema>): CommandSpec | null {
  const p = request.parameters;
  switch (request.operation) {
    case "fwconsole.version": return { executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 15_000 };
    case "fwconsole.reload": return { executable: "/usr/sbin/fwconsole", args: ["reload", "--quiet"], timeoutMs: 120_000 };
    case "fwconsole.status": return { executable: "/usr/sbin/fwconsole", args: ["status", "--json"], timeoutMs: 30_000 };
    case "asterisk.version": return { executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 10_000 };
    case "asterisk.module.list": return { executable: "/usr/sbin/asterisk", args: ["-rx", "module show"], timeoutMs: 20_000 };
    case "asterisk.dialplan.reload": return { executable: "/usr/sbin/asterisk", args: ["-rx", "dialplan reload"], timeoutMs: 30_000 };
    case "freepbx.resource.sync": {
      const kind = z.enum(resourceKinds).parse(p.kind);
      const id = Identifier.parse(p.id);
      const args = ["materialpbx", "--operation", "sync", "--kind", kind, "--id", id];
      if (p.deleted === true) args.push("--deleted");
      return { executable: "/usr/sbin/fwconsole", args, timeoutMs: 60_000 };
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
    case "system.capabilities": return null;
  }
}

function runCommand(spec: CommandSpec): Promise<CommandResult> {
  return new Promise(resolve => {
    const child = spawn(spec.executable, spec.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }
    });
    let stdout = "";
    let stderr = "";
    let outputExceeded = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), spec.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
      if (stdout.length > 1024 * 1024) { outputExceeded = true; child.kill("SIGKILL"); }
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
      if (stderr.length > 256 * 1024) { outputExceeded = true; child.kill("SIGKILL"); }
    });
    child.on("error", error => { clearTimeout(timer); resolve({ exitCode: null, stdout, stderr, error: error.message }); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const error = outputExceeded ? "Command output exceeded the configured limit" : signal ? `Command terminated by ${signal}` : null;
      resolve({ exitCode: code, stdout: stdout.slice(0, 1024 * 1024), stderr: stderr.slice(0, 256 * 1024), error });
    });
  });
}

async function capabilities(): Promise<CommandResult> {
  const observedAt = new Date().toISOString();
  const probes = await Promise.all([
    runCommand({ executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 10_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "module show"], timeoutMs: 20_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show transports"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show endpoints"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "pjsip show registrations"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "manager show settings"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "ari show status"], timeoutMs: 15_000 })
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

async function handle(line: string) {
  const request = RequestSchema.parse(JSON.parse(line));
  const result = request.operation === "system.capabilities" ? await capabilities() : await runCommand(commandFor(request)!);
  return {
    requestId: request.requestId,
    ok: result.exitCode === 0 && !result.error,
    ...result
  };
}

await mkdir(dirname(socketPath), { recursive: true, mode: 0o750 });
await rm(socketPath, { force: true });
const server = createServer(socket => {
  socket.setEncoding("utf8");
  let buffer = "";
  let handled = false;
  socket.on("data", async chunk => {
    if (handled) return;
    buffer += chunk;
    if (buffer.length > 256 * 1024) { handled = true; socket.end(`${JSON.stringify({ requestId: "00000000-0000-0000-0000-000000000000", ok: false, exitCode: null, stdout: "", stderr: "", error: "Request exceeded 256 KiB" })}\n`); return; }
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    handled = true;
    try { socket.end(`${JSON.stringify(await handle(buffer.slice(0, newline)))}\n`); }
    catch (error) { socket.end(`${JSON.stringify({ requestId: safeRequestId(buffer), ok: false, exitCode: null, stdout: "", stderr: "", error: error instanceof Error ? error.message : "Invalid request" })}\n`); }
  });
});
server.listen(socketPath, async () => {
  await chmod(socketPath, 0o660);
  if (Number.isSafeInteger(socketGroupId) && socketGroupId > 0) await chown(socketPath, 0, socketGroupId);
});

function safeRequestId(input: string): string {
  try { return z.string().uuid().parse(JSON.parse(input).requestId); }
  catch { return "00000000-0000-0000-0000-000000000000"; }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close(() => process.exit(0)));
