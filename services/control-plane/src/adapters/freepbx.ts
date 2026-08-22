import { createHash } from "node:crypto";
import { z } from "zod";
import { CapabilityRegistrySchema, FreePbxApplicationPlanSchema, FreePbxApplicationRequestSchema, FreePbxCompilationSchema, ResourceKindSchema, type FreePbxApplicationRequest, type FreePbxApplicationResult, type ManagedResource } from "@materialpbx/protocol";
import { PrivilegedHelperClient } from "./privileged.js";

const featureByKind = { extensions: "extension", trunks: "trunk", "inbound-routes": "inbound-route", "outbound-routes": "outbound-route", ivrs: "ivr", queues: "queue", "ring-groups": "ring-group", "voicemail-boxes": "voicemail", "time-conditions": "time-condition" } as const;
const RequestBindingSchema = z.object({ schemaVersion: z.literal(1), action: z.enum(["apply", "remove"]), kind: ResourceKindSchema, id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/), revision: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const RollbackSchema = z.object({ attempted: z.boolean(), succeeded: z.boolean().nullable(), snapshotId: z.string().nullable(), reason: z.string().nullable() }).strict();

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function desiredStateRequest(action: "apply" | "remove", resource: FreePbxApplicationRequest) {
  const snapshot = { schemaVersion: 1 as const, action, resource, expectedRevision: resource.revision };
  return { snapshot, snapshotSha256: createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex") };
}

function parseBoundBridge(stdout: string, expected: z.infer<typeof RequestBindingSchema>) {
  const bridge = z.object({ storedDesired: z.boolean(), compilation: z.unknown(), applied: z.boolean(), rollback: RollbackSchema, requestBinding: RequestBindingSchema }).passthrough().parse(JSON.parse(stdout));
  if (canonicalJson(bridge.requestBinding) !== canonicalJson(expected)) throw new Error("The FreePBX consumer confirmed a different desired-state request binding");
  return bridge;
}

export class FreePbxAdapter {
  constructor(private readonly helper: PrivilegedHelperClient) {}

  async capabilities() {
    const report = await this.helper.execute("system.capabilities");
    if (!report.ok) throw new Error(report.error ?? (report.stderr || "Capability discovery failed"));
    return CapabilityRegistrySchema.parse(JSON.parse(report.stdout));
  }

  async apply(resource: ManagedResource): Promise<FreePbxApplicationResult> {
    const feature = featureByKind[resource.kind as keyof typeof featureByKind];
    if (!feature) return this.#unsupported(resource.id, `Resource kind ${resource.kind} has no safe typed FreePBX application adapter.`);
    let normalized;
    try { normalized = FreePbxApplicationRequestSchema.parse({ feature, id: resource.id, displayName: resource.displayName, enabled: resource.enabled, revision: resource.revision, configuration: resource.configuration }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Typed configuration validation failed";
      return { ...this.#unsupported(resource.id, "The stored resource did not satisfy the safe typed adapter schema."), warning: message };
    }
    const plan = FreePbxApplicationPlanSchema.parse({ feature, resourceId: resource.id, status: "supported", reason: "A fixed feature adapter accepted the normalized payload.", validationEvidence: [`Schema accepted ${feature} revision ${resource.revision}.`, "No raw dialplan, shell command, or configuration fragment is passed to the helper."], steps: [{ order: 1, operation: "validate-normalized-payload", description: "Validate the feature-specific bounded payload." }, { order: 2, operation: "sync-freepbx-resource", description: "Invoke the fixed FreePBX bridge adapter for this feature and resource." }, { order: 3, operation: "reload-freepbx", description: "Reload FreePBX only after synchronization succeeds." }] });
    const desiredRequest = desiredStateRequest("apply", normalized);
    const sync = await this.helper.execute("freepbx.application.apply", desiredRequest);
    if (!sync.ok) return { plan, storedDesired: true, compilation: { status: "failed", compiler: null, reason: "The native compiler command failed.", snapshotId: null, diff: [] }, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: { attempted: false, succeeded: null, snapshotId: null, reason: null }, warning: sync.error ?? sync.stderr };
    const bridge = parseBoundBridge(sync.stdout, { schemaVersion: 1, action: "apply", kind: resource.kind, id: normalized.id, revision: normalized.revision, sha256: desiredRequest.snapshotSha256 });
    const compilation = FreePbxCompilationSchema.parse(bridge.compilation);
    if (!bridge.applied) return { plan, storedDesired: bridge.storedDesired, compilation, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: bridge.rollback, warning: compilation.reason };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return { plan, storedDesired: bridge.storedDesired, compilation, applied: true, reloaded: reload.ok, runtimeVerification: "pending", partialFailure: !reload.ok, rollback: bridge.rollback, warning: reload.ok ? null : reload.error ?? reload.stderr };
  }

  async rollback(snapshotId: string) { return this.helper.execute("freepbx.application.rollback", { snapshotId }, 60_000); }

  #unsupported(id: string, reason: string): FreePbxApplicationResult { return { plan: FreePbxApplicationPlanSchema.parse({ feature: "unsupported", resourceId: id, status: "unsupported", reason, validationEvidence: ["The desired resource was stored, but no native PBX mutation was attempted."], steps: [] }), storedDesired: true, compilation: { status: "unsupported", compiler: null, reason, snapshotId: null, diff: [] }, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: { attempted: false, succeeded: null, snapshotId: null, reason: null }, warning: reason }; }

  async remove(resource: ManagedResource) {
    const feature = featureByKind[resource.kind as keyof typeof featureByKind];
    if (!feature) return { storedDesired: false, compilation: { status: "unsupported", compiler: null, reason: `Live removal is unsupported for resource kind ${resource.kind}.`, snapshotId: null, diff: [] }, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: { attempted: false, succeeded: null, snapshotId: null, reason: null }, warning: `Live removal is unsupported for resource kind ${resource.kind}.` };
    let normalized: FreePbxApplicationRequest;
    try { normalized = FreePbxApplicationRequestSchema.parse({ feature, id: resource.id, displayName: resource.displayName, enabled: resource.enabled, revision: resource.revision, configuration: resource.configuration }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Typed configuration validation failed";
      return { storedDesired: false, compilation: { status: "failed", compiler: null, reason: "The removed desired-state snapshot did not satisfy the safe typed adapter schema.", snapshotId: null, diff: [] }, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: { attempted: false, succeeded: null, snapshotId: null, reason: null }, warning: message };
    }
    const desiredRequest = desiredStateRequest("remove", normalized);
    const sync = await this.helper.execute("freepbx.application.remove", desiredRequest);
    if (!sync.ok) return { storedDesired: false, compilation: { status: "failed", compiler: null, reason: "The native deletion command failed.", snapshotId: null, diff: [] }, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: { attempted: false, succeeded: null, snapshotId: null, reason: null }, warning: sync.error ?? sync.stderr };
    const bridge = parseBoundBridge(sync.stdout, { schemaVersion: 1, action: "remove", kind: resource.kind, id: normalized.id, revision: normalized.revision, sha256: desiredRequest.snapshotSha256 });
    const compilation = FreePbxCompilationSchema.parse(bridge.compilation);
    if (!bridge.applied) return { storedDesired: bridge.storedDesired, compilation, applied: false, reloaded: false, runtimeVerification: "pending", partialFailure: false, rollback: bridge.rollback, warning: compilation.reason };
    const reload = await this.helper.execute("fwconsole.reload", {}, 120_000);
    return { storedDesired: bridge.storedDesired, compilation, applied: true, reloaded: reload.ok, runtimeVerification: "pending", partialFailure: !reload.ok, rollback: bridge.rollback, warning: reload.ok ? null : reload.error ?? reload.stderr };
  }
}
