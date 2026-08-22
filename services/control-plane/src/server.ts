import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { WebSocketServer } from "ws";
import { z } from "zod";
import {
  FederationEnvelopeSchema,
  FederationScopeSchema,
  ResourceKindSchema,
  ResourceMutationSchema,
  RuntimeEventSchema,
  resourceKinds
} from "@materialpbx/protocol";
import { loadConfig } from "./config.js";
import { readSecret } from "./lib/files.js";
import { AuditLog } from "./lib/audit.js";
import { RuntimeEventBus } from "./lib/events.js";
import { Metrics } from "./lib/metrics.js";
import { constantTimeTextEqual } from "./federation/crypto.js";
import { FederationEngine } from "./federation/engine.js";
import { ResourceStore } from "./resources/store.js";
import { PrivilegedHelperClient } from "./adapters/privileged.js";
import { FreePbxAdapter } from "./adapters/freepbx.js";
import { AmiAdapter } from "./adapters/ami.js";
import { AriAdapter } from "./adapters/ari.js";
import { CallRecordAdapter } from "./adapters/cdr.js";
import { RecordingCatalog } from "./adapters/recordings.js";
import { verifyPayloadIdentity } from "./payload-identity.js";

const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/);
const BUILD_INFO = await verifyPayloadIdentity();

function safeFailure(error: unknown): { name: string; code: string | null } {
  const candidate = error instanceof Error ? error : new Error("Unknown adapter failure");
  const rawCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null;
  const code = typeof rawCode === "string" && /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : null;
  return { name: candidate.name || "Error", code };
}

async function withReadinessDeadline<T>(label: string, timeoutMs: number, action: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`${label} readiness probe exceeded its deadline`), { code: "READINESS_TIMEOUT" })), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function settledReadiness(result: PromiseSettledResult<unknown>) {
  return result.status === "fulfilled" ? { ready: true as const, failure: null } : { ready: false as const, failure: safeFailure(result.reason) };
}

const config = loadConfig();
const adminToken = await readSecret(config.adminTokenFile);
const audit = new AuditLog(`${config.dataDir}/audit/audit.jsonl`);
await audit.initialize();
const resources = new ResourceStore(`${config.dataDir}/resources.json`);
await resources.initialize();
const helper = new PrivilegedHelperClient(config.privilegedHelperSocket);
const freepbx = new FreePbxAdapter(helper);
const ami = new AmiAdapter(config.ami);
const ari = new AriAdapter(config.ari);
const records = new CallRecordAdapter(config.freepbxDatabaseDsnFile);
let recordsAvailable = true;
let recordsInitializationFailure: { name: string; code: string | null } | null = null;
try { await records.initialize(); }
catch (error) { recordsAvailable = false; recordsInitializationFailure = safeFailure(error); }
const recordings = new RecordingCatalog(config.recordingsDir);
const federation = new FederationEngine(`${config.dataDir}/federation`, config.nodeName, config.publicUrl, config.federation.invitationTtlSeconds, config.federation.maxClockSkewSeconds, audit);
await federation.initialize();
const events = new RuntimeEventBus();
const metrics = new Metrics();

const server = (config.tls
  ? Fastify({ logger: { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] }, https: { cert: await readFile(config.tls.certPath), key: await readFile(config.tls.keyPath) }, bodyLimit: 1024 * 1024, requestTimeout: 30_000 })
  : Fastify({ logger: { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] }, bodyLimit: 1024 * 1024, requestTimeout: 30_000 })) as FastifyInstance;

await server.register(cors, { origin: new URL(config.publicUrl).origin, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] });
await server.register(rateLimit, { max: 300, timeWindow: "1 minute", ban: 3 });
if (recordsInitializationFailure) server.log.error({ adapter: "freepbx-database", failure: recordsInitializationFailure }, "database adapter initialization failed");

server.addHook("onRequest", async (request, reply) => {
  metrics.increment("http_requests_total");
  const pathname = request.url.split("?", 1)[0];
  if (pathname === "/healthz" || pathname === "/v1/federation/messages") return;
  const authorization = request.headers.authorization;
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeTextEqual(presented, adminToken)) {
    metrics.increment("auth_refusals_total");
    await audit.record({ actor: request.ip, action: "api.authenticate", target: request.url, outcome: "refused", detail: {} });
    return reply.code(401).send({ error: "authentication_required", message: "A valid administrator credential is required." });
  }
});

server.setErrorHandler(async (error, request, reply) => {
  metrics.increment("http_errors_total");
  const safeError = error instanceof Error ? error : new Error("Unknown request failure");
  const candidateStatus = typeof error === "object" && error !== null && "statusCode" in error ? (error as { statusCode?: unknown }).statusCode : undefined;
  const status = typeof candidateStatus === "number" && Number.isInteger(candidateStatus) ? candidateStatus : error instanceof z.ZodError ? 400 : 500;
  request.log.error({ err: safeError, status }, "request failed");
  await audit.record({ actor: request.ip, action: "api.request", target: request.url, outcome: "failed", detail: { status, errorName: safeError.name } });
  return reply.code(status).send({ error: status === 500 ? "internal_error" : "invalid_request", message: status === 500 ? "The request could not be completed." : safeError.message });
});

server.get("/healthz", async () => ({ status: "ok", time: new Date().toISOString() }));
server.get("/readyz", async (_request, reply) => {
  const [helperResult, databaseResult, amiResult, ariResult] = await Promise.allSettled([
    withReadinessDeadline("privileged helper", 20_000, () => helper.readiness()),
    withReadinessDeadline("database", 8_000, () => records.probe()),
    withReadinessDeadline("AMI", 8_000, () => ami.probe()),
    withReadinessDeadline("ARI", 8_000, () => ari.probe())
  ]);
  const database = settledReadiness(databaseResult);
  const amiReadiness = settledReadiness(amiResult);
  const ariReadiness = settledReadiness(ariResult);
  recordsAvailable = database.ready;
  const helperReady = helperResult.status === "fulfilled" ? helperResult.value : null;
  const helperFailure = helperResult.status === "rejected" ? safeFailure(helperResult.reason) : null;
  const compatibility = {
    ready: Boolean(helperReady && helperReady.build.protocolVersion === BUILD_INFO.protocolVersion && helperReady.build.readinessSchemaVersion === BUILD_INFO.readinessSchemaVersion && helperReady.build.desiredStateSnapshotSchemaVersion === BUILD_INFO.desiredStateSnapshotSchemaVersion),
    expectedService: "@materialpbx/privileged-helper",
    observedService: helperReady?.build.service ?? null,
    protocolVersion: helperReady?.build.protocolVersion ?? null,
    readinessSchemaVersion: helperReady?.build.readinessSchemaVersion ?? null,
    desiredStateSnapshotSchemaVersion: helperReady?.build.desiredStateSnapshotSchemaVersion ?? null
  };
  const checks = {
    helper: { ready: Boolean(helperReady?.helper.ready && helperReady.ready), failure: helperFailure, build: helperReady?.build ?? null },
    database,
    ami: amiReadiness,
    ari: ariReadiness,
    compatibility,
    module: { ...(helperReady?.materialpbxModule ?? { ready: false, inventoryObserved: false, name: null, version: null, status: null }), failure: helperFailure },
    runtime: {
      ready: Boolean(helperReady?.freepbx.ready && helperReady?.asterisk.ready),
      freepbx: helperReady?.freepbx ?? { ready: false, versionObserved: false },
      asterisk: helperReady?.asterisk ?? { ready: false, versionObserved: false },
      failure: helperFailure
    }
  };
  const ready = checks.helper.ready && checks.database.ready && checks.ami.ready && checks.ari.ready && checks.compatibility.ready && checks.module.ready && checks.runtime.ready;
  return reply.code(ready ? 200 : 503).send({ schemaVersion: 1, status: ready ? "ready" : "not-ready", observedAt: new Date().toISOString(), build: BUILD_INFO, checks });
});
server.get("/v1/system/status", async () => {
  let capabilities: Record<string, unknown> | null = null;
  let helperError: string | null = null;
  try { capabilities = await freepbx.capabilities(); } catch (error) { helperError = error instanceof Error ? error.message : "Unavailable"; }
  const warnings = [
    !config.tls ? "TLS is not configured in the control plane. Keep it on loopback or place it behind a verified HTTPS reverse proxy." : null,
    !["127.0.0.1", "::1", "localhost"].includes(config.bind) ? "The control plane is listening beyond loopback. Restrict access with the host firewall and an authenticated HTTPS boundary." : null,
    !recordsAvailable ? "CDR/CEL database access is unavailable. Call record views are incomplete until the database credential or socket is restored." : null,
    helperError ? "The bounded privileged helper is unavailable. Configuration can be saved, but PBX application and reload operations will fail." : null
  ].filter(Boolean);
  return { identity: federation.identity(), build: BUILD_INFO, capabilities, warnings, adapters: { privilegedHelper: !helperError, cdrDatabase: recordsAvailable, ami: "runtime-probed", ari: "runtime-probed" } };
});
server.get("/v1/system/capabilities", async () => freepbx.capabilities());
server.get("/v1/system/capability-registry", async () => freepbx.capabilities());
server.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(metrics.render()));

server.get("/v1/resources", async request => {
  const query = z.object({ kind: ResourceKindSchema.optional() }).parse(request.query);
  return { items: resources.list(query.kind), kinds: resourceKinds };
});
server.get("/v1/resources/:kind/:id", async request => {
  const params = z.object({ kind: ResourceKindSchema, id: Identifier }).parse(request.params);
  const item = resources.get(params.kind, params.id);
  if (!item) throw Object.assign(new Error("Resource not found"), { statusCode: 404 });
  return item;
});
server.put("/v1/resources/:kind/:id", async request => {
  const params = z.object({ kind: ResourceKindSchema, id: Identifier }).parse(request.params);
  const mutation = ResourceMutationSchema.parse(request.body);
  const item = await resources.upsert(params.kind, params.id, mutation);
  const application = await freepbx.apply(item);
  metrics.increment("resource_mutations_total");
  events.publish({ topic: "system", type: "resource.updated", source: "control-plane", payload: { kind: item.kind, id: item.id, revision: item.revision, applied: application.applied } });
  await audit.record({ actor: "local-admin", action: "resource.upsert", target: `${item.kind}:${item.id}`, outcome: application.applied ? "allowed" : "failed", detail: { revision: item.revision, application } });
  return { resource: item, application };
});
server.delete("/v1/resources/:kind/:id", async request => {
  const params = z.object({ kind: ResourceKindSchema, id: Identifier }).parse(request.params);
  const query = z.object({ expectedRevision: z.coerce.number().int().nonnegative().optional() }).parse(request.query);
  const removed = await resources.delete(params.kind, params.id, query.expectedRevision);
  if (!removed) throw Object.assign(new Error("Resource not found"), { statusCode: 404 });
  const application = await freepbx.remove(removed);
  metrics.increment("resource_mutations_total");
  events.publish({ topic: "system", type: "resource.deleted", source: "control-plane", payload: { kind: params.kind, id: params.id, applied: application.applied } });
  await audit.record({ actor: "local-admin", action: "resource.delete", target: `${params.kind}:${params.id}`, outcome: application.applied ? "allowed" : "failed", detail: { revision: removed.revision, application } });
  return { deleted: true, application };
});

const PageQuerySchema = z.object({
  from: z.coerce.date().default(() => new Date(Date.now() - 24 * 60 * 60 * 1000)),
  to: z.coerce.date().default(() => new Date()),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0)
}).refine(value => value.from < value.to, "from must be earlier than to");
server.get("/v1/cdr", async request => { if (!recordsAvailable) throw Object.assign(new Error("CDR database is unavailable"), { statusCode: 503 }); return { items: await records.cdr(PageQuerySchema.parse(request.query)) }; });
server.get("/v1/cel", async request => { if (!recordsAvailable) throw Object.assign(new Error("CEL database is unavailable"), { statusCode: 503 }); return { items: await records.cel(PageQuerySchema.parse(request.query)) }; });
server.get("/v1/recordings", async request => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), cursor: z.string().max(1024).default("") }).parse(request.query);
  return recordings.list(query.limit, query.cursor);
});

server.get("/v1/runtime/channels", async () => ({ items: await ari.request("GET", "channels") }));
server.get("/v1/runtime/endpoints", async () => ({ items: await ari.request("GET", "endpoints") }));
server.get("/v1/runtime/bridges", async () => ({ items: await ari.request("GET", "bridges") }));
server.post("/v1/runtime/originate", async request => {
  const body = z.object({ channel: z.string().min(1).max(256), context: z.string().min(1).max(80), extension: z.string().min(1).max(80), priority: z.coerce.number().int().min(1).max(100), callerId: z.string().max(128).optional(), timeoutMs: z.number().int().min(1000).max(120_000).default(30_000) }).parse(request.body);
  const fields: Record<string, string> = { Channel: body.channel, Context: body.context, Exten: body.extension, Priority: String(body.priority), Timeout: String(body.timeoutMs), Async: "true" };
  if (body.callerId) fields.CallerID = body.callerId;
  const result = await ami.action("Originate", fields);
  await audit.record({ actor: "local-admin", action: "call.originate", target: body.channel, outcome: "allowed", detail: { context: body.context, extension: body.extension } });
  return { accepted: true, result };
});
server.post("/v1/runtime/hangup", async request => {
  const body = z.object({ channel: z.string().min(1).max(256), cause: z.number().int().min(0).max(127).optional() }).parse(request.body);
  const result = await ami.action("Hangup", { Channel: body.channel, ...(body.cause === undefined ? {} : { Cause: String(body.cause) }) });
  await audit.record({ actor: "local-admin", action: "call.hangup", target: body.channel, outcome: "allowed", detail: { cause: body.cause ?? null } });
  return { accepted: true, result };
});
server.post("/v1/resources/call-files/:id/submit", async request => {
  const params = z.object({ id: Identifier }).parse(request.params);
  const resource = resources.get("call-files", params.id);
  if (!resource) throw Object.assign(new Error("Call-file resource not found"), { statusCode: 404 });
  const result = await helper.execute("asterisk.callfile.submit", { id: resource.id });
  await audit.record({ actor: "local-admin", action: "call-file.submit", target: resource.id, outcome: result.ok ? "allowed" : "failed", detail: { exitCode: result.exitCode } });
  return result;
});
server.post("/v1/resources/compiler/rollback", async request => {
  const body = z.object({ snapshotId: z.string().uuid() }).parse(request.body);
  const result = await freepbx.rollback(body.snapshotId);
  if (!result.ok) throw Object.assign(new Error(result.error ?? (result.stderr || "Rollback failed")), { statusCode: 502 });
  return { rollback: JSON.parse(result.stdout), reloaded: false, runtimeVerification: "pending" };
});

server.post("/v1/backups", async request => {
  const body = z.object({ id: Identifier }).parse(request.body);
  const result = await helper.execute("freepbx.backup.start", body, 300_000);
  await audit.record({ actor: "local-admin", action: "backup.start", target: body.id, outcome: result.ok ? "allowed" : "failed", detail: { exitCode: result.exitCode } });
  return result;
});
server.get("/v1/backups", async () => helper.execute("freepbx.backup.status"));

server.get("/v1/federation/identity", async () => federation.identity());
server.get("/v1/federation/peers", async () => ({ items: federation.peers() }));
server.post("/v1/federation/invitations", async request => federation.createInvitation(FederationScopeSchema.parse(request.body)));
server.post("/v1/federation/invitations/inspect", async request => federation.inspectInvitation(request.body));
server.post("/v1/federation/invitations/accept", async request => {
  const body = z.object({ invitation: z.unknown(), confirmedFingerprint: z.string().min(1).max(256), scope: FederationScopeSchema.optional() }).parse(request.body);
  return federation.acceptInvitation(body.invitation, body.confirmedFingerprint, body.scope);
});
server.post("/v1/federation/invitations/:id/confirm", async request => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ acceptance: z.unknown(), confirmedFingerprint: z.string().min(1).max(256) }).parse(request.body);
  return federation.confirmAcceptance(params.id, body.acceptance, body.confirmedFingerprint);
});
server.post("/v1/federation/finalize", async request => { await federation.finalizePairing(request.body); return { paired: true }; });
server.delete("/v1/federation/peers/:id", async request => { const { id } = z.object({ id: z.string().uuid() }).parse(request.params); await federation.revoke(id); return { revoked: true }; });
server.post("/v1/federation/identity/rotate", async () => federation.rotateLocalIdentity());
server.post("/v1/federation/peers/:id/envelopes", async request => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ routeId: z.string().uuid().default(() => randomUUID()), payload: z.unknown(), path: z.array(z.string().uuid()).max(8).default([]) }).parse(request.body);
  return federation.seal(id, body.routeId, body.payload, body.path);
});
server.post("/v1/federation/messages", async request => {
  const envelope = FederationEnvelopeSchema.parse(request.body);
  const opened = await federation.open(envelope);
  metrics.increment("federation_messages_total");
  events.publish({ topic: "federation", type: "message.received", source: "peer", payload: { peerId: opened.peer.peerId, routeId: opened.envelope.routeId } });
  return { accepted: true, messageId: opened.envelope.messageId };
});

const wsServer = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
wsServer.on("connection", socket => {
  const listener = (event: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(RuntimeEventSchema.parse(event))); };
  events.emitter.on("event", listener);
  socket.on("close", () => events.emitter.off("event", listener));
  socket.send(JSON.stringify({ type: "ready", occurredAt: new Date().toISOString() }));
});
server.server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", config.publicUrl);
  if (url.pathname !== "/v1/events") return socket.destroy();
  const protocol = request.headers["sec-websocket-protocol"]?.split(",").map(value => value.trim()).find(value => value.startsWith("materialpbx.token."));
  let presented = "";
  try { if (protocol) presented = Buffer.from(protocol.slice("materialpbx.token.".length), "base64url").toString("utf8"); } catch { presented = ""; }
  if (!constantTimeTextEqual(presented, adminToken)) return socket.destroy();
  wsServer.handleUpgrade(request, socket, head, websocket => wsServer.emit("connection", websocket, request));
});

events.emitter.on("event", () => metrics.increment("runtime_events_total"));
await server.listen({ host: config.bind, port: config.port });

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, async () => {
  await server.close();
  await records.close();
  process.exit(0);
});
