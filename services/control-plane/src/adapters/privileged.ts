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

export type PrivilegedOperation =
  | "system.capabilities"
  | "fwconsole.version"
  | "fwconsole.reload"
  | "fwconsole.status"
  | "freepbx.resource.sync"
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
}
