import { lstat, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export interface RecordingEntry { path: string; size: number; modifiedAt: string }

export class RecordingCatalog {
  #root: string;
  constructor(root: string) { this.#root = resolve(root); }

  async list(limit = 100, cursor = ""): Promise<{ items: RecordingEntry[]; nextCursor: string | null }> {
    const entries: RecordingEntry[] = [];
    const queue = [this.#root];
    while (queue.length && entries.length <= 10_000) {
      const directory = queue.shift()!;
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const full = resolve(directory, item.name);
        if (full !== this.#root && !full.startsWith(`${this.#root}${sep}`)) throw new Error("Recording path escaped the configured root");
        if (item.isSymbolicLink()) continue;
        if (item.isDirectory()) { queue.push(full); continue; }
        if (!item.isFile() || !/\.(wav|wav49|gsm|ulaw|alaw|mp3|ogg)$/i.test(item.name)) continue;
        const stat = await lstat(full);
        entries.push({ path: relative(this.#root, full).split(sep).join("/"), size: stat.size, modifiedAt: stat.mtime.toISOString() });
      }
    }
    entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path));
    const start = cursor ? Math.max(0, entries.findIndex(item => item.path === cursor) + 1) : 0;
    const items = entries.slice(start, start + Math.max(1, Math.min(limit, 500)));
    return { items, nextCursor: start + items.length < entries.length ? items.at(-1)!.path : null };
  }
}
