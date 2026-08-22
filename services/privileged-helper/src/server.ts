import { createServer } from "node:net";
import { chmod, chown, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { z } from "zod";
import { resourceKinds } from "@materialpbx/protocol";

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
  const [freepbx, asterisk, modules] = await Promise.all([
    runCommand({ executable: "/usr/sbin/fwconsole", args: ["--version"], timeoutMs: 15_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "core show version"], timeoutMs: 10_000 }),
    runCommand({ executable: "/usr/sbin/asterisk", args: ["-rx", "module show"], timeoutMs: 20_000 })
  ]);
  const moduleText = modules.stdout.toLowerCase();
  const report = {
    generatedAt: new Date().toISOString(),
    freepbx: { available: freepbx.exitCode === 0, version: freepbx.exitCode === 0 ? freepbx.stdout.trim() : null },
    asterisk: { available: asterisk.exitCode === 0, version: asterisk.exitCode === 0 ? asterisk.stdout.trim() : null },
    modules: {
      ari: moduleText.includes("res_ari.so"),
      webrtc: moduleText.includes("res_http_websocket.so") && moduleText.includes("chan_pjsip.so"),
      stirShaken: moduleText.includes("res_stir_shaken.so"),
      cel: moduleText.includes("cel_"),
      cdr: moduleText.includes("cdr_")
    }
  };
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
