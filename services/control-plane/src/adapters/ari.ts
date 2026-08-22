import { readSecret } from "../lib/files.js";
import { z } from "zod";

const allowedRoots = new Set(["asterisk", "bridges", "channels", "deviceStates", "endpoints", "mailboxes", "playbacks", "recordings", "sounds"]);
const AriAsteriskInfoSchema = z.object({
  build: z.record(z.string(), z.unknown()),
  system: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()),
  status: z.record(z.string(), z.unknown())
}).passthrough();

export class AriAdapter {
  constructor(private readonly config: { baseUrl: string; username: string; passwordFile: string }) {}

  async probe(): Promise<void> {
    const response = await this.request("GET", "asterisk/info", undefined, 5_000);
    AriAsteriskInfoSchema.parse(response);
  }

  async request(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeoutMs = 10_000): Promise<unknown> {
    const normalized = path.replace(/^\/+/, "");
    const root = normalized.split("/", 1)[0];
    if (!allowedRoots.has(root) || normalized.includes("..")) throw new Error("ARI path is outside the allowlist");
    const password = await readSecret(this.config.passwordFile);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(new URL(normalized, `${this.config.baseUrl.replace(/\/$/, "")}/`), {
        method,
        signal: controller.signal,
        redirect: "error",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.config.username}:${password}`).toString("base64")}`,
          "content-type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error("ARI response exceeded 2 MB");
      if (!response.ok) throw new Error(`ARI returned HTTP ${response.status}`);
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }
}
