import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readSecret } from "../lib/files.js";

type AmiMessage = Record<string, string>;
const AmiPingResponseSchema = z.object({ Response: z.literal("Success"), Ping: z.literal("Pong") }).passthrough();

function encodeAmi(message: AmiMessage): string {
  return `${Object.entries(message).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`;
}

function decodeAmi(block: string): AmiMessage {
  return Object.fromEntries(block.split("\r\n").filter(Boolean).map(line => {
    const index = line.indexOf(":");
    return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 1).trimStart()];
  }));
}

export class AmiAdapter {
  constructor(private readonly config: { host: string; port: number; username: string; secretFile: string }) {}

  async probe(): Promise<void> {
    const messages = await this.action("Ping", {}, 5_000);
    if (!messages.some(message => AmiPingResponseSchema.safeParse(message).success)) {
      throw new Error("AMI did not return its expected Ping response");
    }
  }

  async action(action: string, fields: AmiMessage = {}, timeoutMs = 10_000): Promise<AmiMessage[]> {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(action)) throw new Error("Invalid AMI action name");
    const secret = await readSecret(this.config.secretFile);
    const actionId = randomUUID();
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.config.host, port: this.config.port });
      let buffer = "";
      let authenticated = false;
      let settled = false;
      const messages: AmiMessage[] = [];
      const timer = setTimeout(() => finish(new Error(`AMI action timed out: ${action}`)), timeoutMs);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        error ? reject(error) : resolve(messages);
      };
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(encodeAmi({ Action: "Login", Username: this.config.username, Secret: secret, Events: "off" })));
      socket.on("data", chunk => {
        buffer += chunk;
        if (buffer.length > 2_000_000) return finish(new Error("AMI response exceeded 2 MB"));
        for (;;) {
          const boundary = buffer.indexOf("\r\n\r\n");
          if (boundary < 0) break;
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 4);
          if (block.startsWith("Asterisk Call Manager/")) continue;
          const message = decodeAmi(block);
          if (!authenticated) {
            if (message.Response !== "Success") return finish(new Error("AMI authentication failed"));
            authenticated = true;
            socket.write(encodeAmi({ Action: action, ActionID: actionId, ...fields }));
            continue;
          }
          messages.push(message);
          const belongs = message.ActionID === actionId || !message.ActionID;
          if (belongs && (message.Response === "Error" || message.EventList === "Complete" || (message.Response && !message.EventList))) {
            socket.write(encodeAmi({ Action: "Logoff" }));
            return message.Response === "Error" ? finish(new Error(message.Message || "AMI action failed")) : finish();
          }
        }
      });
      socket.on("error", error => finish(error));
      socket.on("end", () => { if (messages.length === 0) finish(new Error("AMI connection ended without a response")); });
    });
  }
}
