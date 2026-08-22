import { z } from "zod";

const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@+-]+$/);
const NumberPattern = z.string().min(1).max(64).regex(/^[0-9XZN*#+.!\[\]-]+$/);
const Destination = z.object({ type: z.enum(["extension", "ivr", "queue", "ring-group", "voicemail", "terminate"]), id: Id.optional() }).strict();
const Base = { id: Id, displayName: z.string().min(1).max(256), enabled: z.boolean(), revision: z.number().int().positive() };
export const FreePbxApplicationFeatureSchema = z.enum(["extension", "trunk", "inbound-route", "outbound-route", "ivr", "queue", "ring-group", "voicemail", "time-condition"]);

export const FreePbxApplicationRequestSchema = z.discriminatedUnion("feature", [
  z.object({ ...Base, feature: z.literal("extension"), configuration: z.object({ extension: z.string().regex(/^[0-9]{2,12}$/), callerIdName: z.string().max(80).optional(), voicemailMailbox: Id.optional() }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("trunk"), configuration: z.object({ technology: z.literal("pjsip"), host: z.string().min(1).max(253), port: z.number().int().min(1).max(65535).default(5060), transport: z.enum(["udp", "tcp", "tls"]), authentication: z.enum(["none", "outbound-registration", "credentials-reference"]), credentialReference: Id.optional() }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("inbound-route"), configuration: z.object({ didPattern: NumberPattern, callerIdPattern: NumberPattern.optional(), destination: Destination }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("outbound-route"), configuration: z.object({ dialPatterns: z.array(NumberPattern).min(1).max(128), trunkIds: z.array(Id).min(1).max(16), emergency: z.boolean().default(false) }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("ivr"), configuration: z.object({ announcementId: Id, timeoutSeconds: z.number().int().min(1).max(60), invalidDestination: Destination, entries: z.array(z.object({ digit: z.string().regex(/^[0-9*#]$/), destination: Destination }).strict()).max(12) }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("queue"), configuration: z.object({ number: z.string().regex(/^[0-9]{2,12}$/), strategy: z.enum(["ringall", "leastrecent", "fewestcalls", "random", "rrmemory"]), memberExtensionIds: z.array(Id).min(1).max(256), failoverDestination: Destination }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("ring-group"), configuration: z.object({ number: z.string().regex(/^[0-9]{2,12}$/), strategy: z.enum(["ringall", "hunt", "memoryhunt", "firstavailable"]), memberExtensionIds: z.array(Id).min(1).max(64), ringTimeSeconds: z.number().int().min(1).max(300), failoverDestination: Destination }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("voicemail"), configuration: z.object({ mailbox: z.string().regex(/^[0-9]{2,12}$/), email: z.string().email().max(254).optional(), attachAudio: z.boolean(), maxMessageSeconds: z.number().int().min(10).max(3600) }).strict() }).strict(),
  z.object({ ...Base, feature: z.literal("time-condition"), configuration: z.object({ timezone: z.string().min(1).max(64), windows: z.array(z.object({ weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), start: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/), end: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) }).strict()).min(1).max(32), matchedDestination: Destination, unmatchedDestination: Destination }).strict() }).strict()
]);
export type FreePbxApplicationRequest = z.infer<typeof FreePbxApplicationRequestSchema>;

export const FreePbxApplicationPlanSchema = z.object({
  feature: FreePbxApplicationFeatureSchema.or(z.literal("unsupported")),
  resourceId: Id,
  status: z.enum(["supported", "unsupported"]),
  reason: z.string().min(1).max(1024),
  validationEvidence: z.array(z.string().min(1).max(512)).max(32),
  steps: z.array(z.object({ order: z.number().int().positive(), operation: z.enum(["validate-normalized-payload", "sync-freepbx-resource", "reload-freepbx"]), description: z.string().min(1).max(512) }).strict()).max(8)
});
export type FreePbxApplicationPlan = z.infer<typeof FreePbxApplicationPlanSchema>;

export const FreePbxCompilationSchema = z.object({ status: z.enum(["compiled", "unsupported", "failed"]), compiler: z.string().max(128).nullable(), reason: z.string().min(1).max(1024), snapshotId: z.string().uuid().nullable(), diff: z.array(z.object({ operation: z.enum(["create", "replace", "remove", "unchanged"]), target: z.string().max(256), summary: z.string().max(512) })).max(32) });
export const FreePbxApplicationResultSchema = z.object({ plan: FreePbxApplicationPlanSchema, storedDesired: z.boolean(), compilation: FreePbxCompilationSchema, applied: z.boolean(), reloaded: z.boolean(), runtimeVerification: z.literal("pending"), partialFailure: z.boolean(), rollback: z.object({ attempted: z.boolean(), succeeded: z.boolean().nullable(), snapshotId: z.string().uuid().nullable(), reason: z.string().max(1024).nullable() }), warning: z.string().max(2048).nullable() });
export type FreePbxApplicationResult = z.infer<typeof FreePbxApplicationResultSchema>;
