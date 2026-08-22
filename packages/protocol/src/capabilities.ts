import { z } from "zod";

export const CapabilityStateSchema = z.enum(["installed", "configured", "running", "unavailable", "unknown"]);
export const CapabilityCategorySchema = z.enum(["platform", "interface", "signaling", "telephony", "media", "records", "security", "hardware"]);
export const CapabilityEvidenceSchema = z.object({
  source: z.enum(["asterisk-cli", "fwconsole", "module-runtime", "module-filesystem"]),
  observedAt: z.string().datetime(),
  summary: z.string().min(1).max(512),
  facts: z.record(z.string().max(80), z.union([z.string().max(512), z.number().finite(), z.boolean(), z.null()])).default({})
});
export const CapabilityEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]{1,80}$/),
  category: CapabilityCategorySchema,
  state: CapabilityStateSchema,
  reason: z.string().min(1).max(1024),
  evidence: z.array(CapabilityEvidenceSchema).max(16)
});
export const CapabilityRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  degraded: z.boolean(),
  warnings: z.array(z.string().min(1).max(512)).max(32),
  capabilities: z.array(CapabilityEntrySchema).max(128)
});
export type CapabilityRegistry = z.infer<typeof CapabilityRegistrySchema>;
