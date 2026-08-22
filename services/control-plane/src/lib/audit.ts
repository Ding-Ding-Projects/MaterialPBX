import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { appendDurable } from "./files.js";

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  target: string;
  outcome: "allowed" | "refused" | "failed";
  detail: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class AuditLog {
  #lastHash = "0".repeat(64);
  constructor(private readonly path: string) {}

  async initialize(): Promise<void> {
    try {
      const lines = (await readFile(this.path, "utf8")).trim().split("\n").filter(Boolean);
      let previous = "0".repeat(64);
      for (const line of lines) {
        const entry = JSON.parse(line) as AuditEntry;
        const { hash, ...unsigned } = entry;
        const expected = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
        if (entry.previousHash !== previous || hash !== expected) throw new Error("Audit hash chain verification failed");
        previous = hash;
      }
      this.#lastHash = previous;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async record(input: Omit<AuditEntry, "id" | "occurredAt" | "previousHash" | "hash">): Promise<AuditEntry> {
    const unsigned = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...input,
      previousHash: this.#lastHash
    };
    const entry: AuditEntry = {
      ...unsigned,
      hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")
    };
    await appendDurable(this.path, `${JSON.stringify(entry)}\n`);
    this.#lastHash = entry.hash;
    return entry;
  }
}
