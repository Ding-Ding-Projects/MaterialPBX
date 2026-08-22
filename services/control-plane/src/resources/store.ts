import { readFile } from "node:fs/promises";
import type { ManagedResource, ResourceKind, ResourceMutation } from "@materialpbx/protocol";
import { atomicWrite } from "../lib/files.js";

interface StoreDocument {
  version: 1;
  resources: ManagedResource[];
}

export class ResourceStore {
  #resources = new Map<string, ManagedResource>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async initialize(): Promise<void> {
    try {
      const document = JSON.parse(await readFile(this.path, "utf8")) as StoreDocument;
      if (document.version !== 1 || !Array.isArray(document.resources)) throw new Error("Unsupported resource store version");
      this.#resources = new Map(document.resources.map(resource => [`${resource.kind}:${resource.id}`, resource]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.#persist();
    }
  }

  list(kind?: ResourceKind): ManagedResource[] {
    return [...this.#resources.values()]
      .filter(resource => !kind || resource.kind === kind)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  get(kind: ResourceKind, id: string): ManagedResource | null {
    return this.#resources.get(`${kind}:${id}`) ?? null;
  }

  async upsert(kind: ResourceKind, id: string, mutation: ResourceMutation): Promise<ManagedResource> {
    return this.#exclusive(async () => {
      const key = `${kind}:${id}`;
      const prior = this.#resources.get(key);
      if (mutation.expectedRevision !== undefined && mutation.expectedRevision !== (prior?.revision ?? 0)) {
        throw Object.assign(new Error("Revision conflict"), { statusCode: 409 });
      }
      const now = new Date().toISOString();
      const resource: ManagedResource = {
        id,
        kind,
        displayName: mutation.displayName,
        enabled: mutation.enabled,
        revision: (prior?.revision ?? 0) + 1,
        configuration: mutation.configuration,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now
      };
      this.#resources.set(key, resource);
      await this.#persist();
      return resource;
    });
  }

  async delete(kind: ResourceKind, id: string, expectedRevision?: number): Promise<ManagedResource | null> {
    return this.#exclusive(async () => {
      const key = `${kind}:${id}`;
      const prior = this.#resources.get(key);
      if (!prior) return null;
      if (expectedRevision !== undefined && expectedRevision !== prior.revision) {
        throw Object.assign(new Error("Revision conflict"), { statusCode: 409 });
      }
      this.#resources.delete(key);
      await this.#persist();
      return prior;
    });
  }

  async #exclusive<T>(action: () => Promise<T>): Promise<T> {
    const prior = this.#writeQueue;
    let release!: () => void;
    this.#writeQueue = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try { return await action(); } finally { release(); }
  }

  async #persist(): Promise<void> {
    const document: StoreDocument = { version: 1, resources: [...this.#resources.values()] };
    await atomicWrite(this.path, `${JSON.stringify(document, null, 2)}\n`);
  }
}
