import type { ManagedResource } from "@materialpbx/protocol";
import { PrivilegedHelperClient } from "./privileged.js";

export interface ApplyResult {
  applied: boolean;
  reloaded: boolean;
  warning: string | null;
}

export class FreePbxAdapter {
  constructor(private readonly helper: PrivilegedHelperClient) {}

  async capabilities() {
    const report = await this.helper.execute("system.capabilities");
    if (!report.ok) throw new Error(report.error ?? (report.stderr || "Capability discovery failed"));
    return JSON.parse(report.stdout) as Record<string, unknown>;
  }

  async apply(resource: ManagedResource): Promise<ApplyResult> {
    const sync = await this.helper.execute("freepbx.resource.sync", { kind: resource.kind, id: resource.id });
    if (!sync.ok) return { applied: false, reloaded: false, warning: sync.error ?? sync.stderr };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return {
      applied: true,
      reloaded: reload.ok,
      warning: reload.ok ? null : reload.error ?? reload.stderr
    };
  }

  async remove(kind: string, id: string): Promise<ApplyResult> {
    const sync = await this.helper.execute("freepbx.resource.sync", { kind, id, deleted: true });
    if (!sync.ok) return { applied: false, reloaded: false, warning: sync.error ?? sync.stderr };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return { applied: true, reloaded: reload.ok, warning: reload.ok ? null : reload.error ?? reload.stderr };
  }
}
