import { z } from "zod";

export const resourceKinds = [
  "extensions",
  "users",
  "devices",
  "trunks",
  "inbound-routes",
  "outbound-routes",
  "ivrs",
  "queues",
  "conferences",
  "voicemail-boxes",
  "recording-policies",
  "calendars",
  "presence-states",
  "parking-lots",
  "paging-groups",
  "announcements",
  "time-conditions",
  "call-files",
  "dynamic-features",
  "webrtc-clients"
] as const;

export const ResourceKindSchema = z.enum(resourceKinds);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema).max(512),
    z.record(z.string().max(128), JsonValueSchema)
  ])
);

export const ManagedResourceSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@+-]+$/),
  kind: ResourceKindSchema,
  displayName: z.string().min(1).max(256),
  enabled: z.boolean().default(true),
  revision: z.number().int().nonnegative(),
  configuration: z.record(z.string().max(128), JsonValueSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ManagedResource = z.infer<typeof ManagedResourceSchema>;

export const ResourceMutationSchema = z.object({
  displayName: z.string().min(1).max(256),
  enabled: z.boolean().default(true),
  expectedRevision: z.number().int().nonnegative().optional(),
  configuration: z.record(z.string().max(128), JsonValueSchema).refine(
    value => Buffer.byteLength(JSON.stringify(value), "utf8") <= 256 * 1024,
    "configuration exceeds 256 KiB"
  )
});

export type ResourceMutation = z.infer<typeof ResourceMutationSchema>;

export const RuntimeEventSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  topic: z.enum([
    "channel",
    "bridge",
    "endpoint",
    "queue",
    "presence",
    "voicemail",
    "recording",
    "cdr",
    "cel",
    "federation",
    "system",
    "audit"
  ]),
  type: z.string().min(1).max(128),
  occurredAt: z.string().datetime(),
  source: z.enum(["ami", "ari", "freepbx", "control-plane", "peer"]),
  payload: z.record(z.string(), JsonValueSchema)
});

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const CapabilityReportSchema = z.object({
  generatedAt: z.string().datetime(),
  asterisk: z.object({ version: z.string().nullable(), ami: z.boolean(), ari: z.boolean() }),
  freepbx: z.object({ version: z.string().nullable(), fwconsole: z.boolean(), database: z.boolean() }),
  features: z.record(z.string(), z.object({ available: z.boolean(), reason: z.string().nullable() })),
  security: z.object({
    stirShaken: z.object({ available: z.boolean(), reason: z.string().nullable() }),
    tls: z.boolean(),
    federation: z.boolean()
  })
});

export type CapabilityReport = z.infer<typeof CapabilityReportSchema>;
