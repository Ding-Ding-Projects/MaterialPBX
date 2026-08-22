import { CapabilityRegistrySchema, FreePbxApplicationPlanSchema, FreePbxApplicationRequestSchema, type FreePbxApplicationResult, type ManagedResource } from "@materialpbx/protocol";
import { PrivilegedHelperClient } from "./privileged.js";

const featureByKind = { extensions: "extension", trunks: "trunk", "inbound-routes": "inbound-route", "outbound-routes": "outbound-route", ivrs: "ivr", queues: "queue", "ring-groups": "ring-group", "voicemail-boxes": "voicemail", "time-conditions": "time-condition" } as const;

export class FreePbxAdapter {
  constructor(private readonly helper: PrivilegedHelperClient) {}

  async capabilities() {
    const report = await this.helper.execute("system.capabilities");
    if (!report.ok) throw new Error(report.error ?? (report.stderr || "Capability discovery failed"));
    return CapabilityRegistrySchema.parse(JSON.parse(report.stdout));
  }

  async apply(resource: ManagedResource): Promise<FreePbxApplicationResult> {
    const feature = featureByKind[resource.kind as keyof typeof featureByKind];
    if (!feature) return { plan: FreePbxApplicationPlanSchema.parse({ feature: "unsupported", resourceId: resource.id, status: "unsupported", reason: `Resource kind ${resource.kind} has no safe typed FreePBX application adapter.`, validationEvidence: ["The desired resource was stored, but no live mutation was attempted."], steps: [] }), applied: false, reloaded: false, partialFailure: false, warning: "Live application is unsupported for this resource kind." };
    let normalized;
    try { normalized = FreePbxApplicationRequestSchema.parse({ feature, id: resource.id, displayName: resource.displayName, enabled: resource.enabled, revision: resource.revision, configuration: resource.configuration }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Typed configuration validation failed";
      return { plan: FreePbxApplicationPlanSchema.parse({ feature, resourceId: resource.id, status: "unsupported", reason: "The stored resource did not satisfy the safe typed adapter schema.", validationEvidence: [message.slice(0, 512)], steps: [{ order: 1, operation: "validate-normalized-payload", description: "Validate the feature-specific bounded payload." }] }), applied: false, reloaded: false, partialFailure: false, warning: message };
    }
    const plan = FreePbxApplicationPlanSchema.parse({ feature, resourceId: resource.id, status: "supported", reason: "A fixed feature adapter accepted the normalized payload.", validationEvidence: [`Schema accepted ${feature} revision ${resource.revision}.`, "No raw dialplan, shell command, or configuration fragment is passed to the helper."], steps: [{ order: 1, operation: "validate-normalized-payload", description: "Validate the feature-specific bounded payload." }, { order: 2, operation: "sync-freepbx-resource", description: "Invoke the fixed FreePBX bridge adapter for this feature and resource." }, { order: 3, operation: "reload-freepbx", description: "Reload FreePBX only after synchronization succeeds." }] });
    const sync = await this.helper.execute("freepbx.application.apply", normalized);
    if (!sync.ok) return { plan, applied: false, reloaded: false, partialFailure: false, warning: sync.error ?? sync.stderr };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return { plan, applied: true, reloaded: reload.ok, partialFailure: !reload.ok, warning: reload.ok ? null : reload.error ?? reload.stderr };
  }

  async remove(kind: string, id: string) {
    const feature = featureByKind[kind as keyof typeof featureByKind];
    if (!feature) return { applied: false, reloaded: false, partialFailure: false, warning: `Live removal is unsupported for resource kind ${kind}.` };
    const sync = await this.helper.execute("freepbx.application.remove", { feature, id });
    if (!sync.ok) return { applied: false, reloaded: false, partialFailure: false, warning: sync.error ?? sync.stderr };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return { applied: true, reloaded: reload.ok, partialFailure: !reload.ok, warning: reload.ok ? null : reload.error ?? reload.stderr };
  }
}
