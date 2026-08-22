import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const ReplySchema = z.object({
  requestId: z.string().uuid(),
  ok: z.boolean(),
  exitCode: z.number().int().nullable(),
  stdout: z.string().max(1024 * 1024),
  stderr: z.string().max(256 * 1024),
  error: z.string().max(2048).nullable()
});

const BuildInfoSchema = z.object({
  service: z.literal("@materialpbx/privileged-helper"),
  serviceVersion: z.string().min(1).max(64),
  protocolVersion: z.literal(1),
  readinessSchemaVersion: z.literal(1),
  desiredStateSnapshotSchemaVersion: z.literal(1),
  installedManifestSha256: z.string().regex(/^(?!0{64}$)[a-f0-9]{64}$/)
}).strict();
const HelperIdentitySchema = z.object({ schemaVersion: z.literal(1), build: BuildInfoSchema }).strict();

const HelperReadinessSchema = z.object({
  schemaVersion: z.literal(1),
  observedAt: z.string().datetime(),
  build: BuildInfoSchema,
  helper: z.object({ ready: z.boolean() }).strict(),
  freepbx: z.object({ ready: z.boolean(), versionObserved: z.boolean() }).strict(),
  asterisk: z.object({ ready: z.boolean(), versionObserved: z.boolean() }).strict(),
  materialpbxModule: z.object({ ready: z.boolean(), inventoryObserved: z.boolean(), name: z.string().nullable(), version: z.string().nullable(), status: z.string().nullable() }).strict(),
  ready: z.boolean()
}).strict();

export type HelperBuildInfo = z.infer<typeof BuildInfoSchema>;
export type HelperReadiness = z.infer<typeof HelperReadinessSchema>;

export type PrivilegedOperation =
  | "system.identity"
  | "system.readiness"
  | "system.capabilities"
  | "fwconsole.version"
  | "fwconsole.reload"
  | "freepbx.application.apply"
  | "freepbx.application.remove"
  | "freepbx.application.rollback"
  | "freepbx.backup.start"
  | "freepbx.backup.status"
  | "asterisk.version"
  | "asterisk.module.list"
  | "asterisk.dialplan.reload"
  | "asterisk.callfile.submit";

export class PrivilegedHelperClient {
  constructor(private readonly socketPath: string) {}

  execute(operation: PrivilegedOperation, parameters: Record<string, unknown> = {}, timeoutMs = 30_000) {
    const requestId = randomUUID();
    const request = `${JSON.stringify({ requestId, operation, parameters })}\n`;
    if (Buffer.byteLength(request) > 256 * 1024) return Promise.reject(new Error("Privileged helper request exceeded 256 KiB"));
    return new Promise<z.infer<typeof ReplySchema>>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      let response = "";
      let settled = false;
      const timer = setTimeout(() => finish(new Error(`Privileged operation timed out: ${operation}`)), timeoutMs);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
      };
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(request));
      socket.on("data", chunk => {
        response += chunk;
        if (response.length > 1_500_000) finish(new Error("Privileged helper response exceeded limit"));
        const newline = response.indexOf("\n");
        if (newline < 0) return;
        try {
          const parsed = ReplySchema.parse(JSON.parse(response.slice(0, newline)));
          if (parsed.requestId !== requestId) throw new Error("Privileged helper request ID mismatch");
          settled = true;
          clearTimeout(timer);
          socket.end();
          resolve(parsed);
        } catch (error) {
          finish(error as Error);
        }
      });
      socket.on("error", error => finish(error));
      socket.on("end", () => {
        if (!settled) finish(new Error("Privileged helper closed without a response"));
      });
    });
  }

  async identity(): Promise<HelperBuildInfo> {
    const reply = await this.execute("system.identity");
    if (!reply.ok) throw new Error(reply.error ?? (reply.stderr || "Privileged helper identity probe failed"));
    return HelperIdentitySchema.parse(JSON.parse(reply.stdout)).build;
  }

  async readiness(): Promise<HelperReadiness> {
    const reply = await this.execute("system.readiness", {}, 18_000);
    const parsed = HelperReadinessSchema.parse(JSON.parse(reply.stdout));
    if (reply.ok !== parsed.ready) throw new Error("Privileged helper readiness envelope was internally inconsistent");
    return parsed;
  }
}
