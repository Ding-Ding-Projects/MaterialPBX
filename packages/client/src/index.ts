export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'offline' | 'permission-denied' | 'incompatible'

export type PbxResourceKind =
  | 'extensions' | 'users' | 'devices' | 'trunks' | 'inbound-routes' | 'outbound-routes'
  | 'ivrs' | 'queues' | 'ring-groups' | 'conferences' | 'voicemail' | 'recordings' | 'cdr' | 'cel'
  | 'calendars' | 'presence' | 'parking' | 'paging' | 'announcements' | 'time-conditions'
  | 'webrtc' | 'paired-servers' | 'backups' | 'observability' | 'security'

export interface PbxResource {
  id: string
  kind: PbxResourceKind
  name: string
  summary: string
  enabled: boolean
  tags: string[]
  updatedAt: string
  revision?: number
  details?: Record<string, unknown>
  provenance?: 'server' | 'local-draft'
  pendingReview?: boolean
}

export interface NativeApplicationOutcome {
  storedDesired?: boolean
  applied: boolean
  reloaded: boolean
  runtimeVerification: string
  partialFailure: boolean
  compilation?: Record<string, unknown>
  rollback?: Record<string, unknown>
  warning?: string | null
}

export interface HealthSnapshot {
  state: ConnectionState
  serverName: string
  asteriskVersion?: string
  freePbxVersion?: string
  activeCalls?: number
  registeredDevices?: number
  warnings: string[]
  checkedAt: string
}

export interface CapabilityEvidence { source: 'asterisk-cli' | 'fwconsole' | 'module-runtime' | 'module-filesystem'; observedAt: string; summary: string; facts: Record<string, string | number | boolean | null> }
export interface CapabilityRecord { id: string; category: 'platform' | 'interface' | 'signaling' | 'telephony' | 'media' | 'records' | 'security' | 'hardware'; state: 'installed' | 'configured' | 'running' | 'unavailable' | 'unknown'; reason: string; evidence: CapabilityEvidence[] }
export interface CapabilitySnapshot { schemaVersion: 1; generatedAt: string; degraded: boolean; warnings: string[]; capabilities: CapabilityRecord[] }
export interface SystemStatusSnapshot { identity: Record<string, unknown>; capabilities: CapabilitySnapshot | null; warnings: string[]; adapters: { privilegedHelper: boolean; cdrDatabase: boolean; ami: 'runtime-probed'; ari: 'runtime-probed' } }
export interface PreflightResult { ok: boolean; state: ConnectionState; message: string; health?: HealthSnapshot; capabilities?: CapabilitySnapshot; status?: SystemStatusSnapshot }
export interface SaveResult { ok: boolean; resource?: PbxResource; application?: NativeApplicationOutcome; storedLocally?: boolean; message: string; state?: ConnectionState }

export interface MaterialPbxClient {
  readonly state: ConnectionState
  preflight(): Promise<PreflightResult>
  health(): Promise<HealthSnapshot>
  capabilities(): Promise<CapabilitySnapshot>
  list(kind: PbxResourceKind): Promise<PbxResource[]>
  save(resource: PbxResource): Promise<SaveResult>
  remove(kind: PbxResourceKind, id: string): Promise<SaveResult>
  validateTestCall(destination: string): Promise<SaveResult>
}

const disconnectedMessage = 'No PBX is connected. Changes remain local until you connect a server.'
const resourceKinds: PbxResourceKind[] = ['extensions','users','devices','trunks','inbound-routes','outbound-routes','ivrs','queues','ring-groups','conferences','voicemail','recordings','cdr','cel','calendars','presence','parking','paging','announcements','time-conditions','webrtc','paired-servers','backups','observability','security']
const localDraftStorageKey = 'materialpbx.resource-drafts.v1'
const localDraftLimit = 100
const localDraftByteLimit = 256 * 1024
let memoryDrafts: PbxResource[] = []

const localStorageIfAvailable = (): Storage | null => {
  try { return (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage ?? null }
  catch { return null }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const normalizeLocalDraft = (value: unknown): PbxResource | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 128) return null
  if (typeof value.kind !== 'string' || !resourceKinds.includes(value.kind as PbxResourceKind)) return null
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 256 || typeof value.summary !== 'string') return null
  if (typeof value.enabled !== 'boolean' || !Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string') || typeof value.updatedAt !== 'string') return null
  if (!isRecord(value.details)) return null
  return { id: value.id, kind: value.kind as PbxResourceKind, name: value.name, summary: value.summary, enabled: value.enabled, tags: value.tags as string[], updatedAt: value.updatedAt, revision: typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : undefined, details: value.details, provenance: 'local-draft', pendingReview: true }
}

const readLocalDrafts = (): PbxResource[] => {
  const storage = localStorageIfAvailable()
  if (!storage) return [...memoryDrafts]
  const raw = storage.getItem(localDraftStorageKey)
  if (!raw) return []
  try {
    if (new TextEncoder().encode(raw).byteLength > localDraftByteLimit) throw new Error('oversized')
    const envelope = JSON.parse(raw) as unknown
    if (!isRecord(envelope) || envelope.version !== 1 || !Array.isArray(envelope.drafts) || envelope.drafts.length > localDraftLimit) throw new Error('invalid')
    const drafts = envelope.drafts.map(normalizeLocalDraft)
    if (drafts.some(draft => draft === null)) throw new Error('invalid')
    return drafts as PbxResource[]
  } catch {
    storage.removeItem(localDraftStorageKey)
    return []
  }
}

const writeLocalDrafts = (drafts: PbxResource[]) => {
  if (drafts.length > localDraftLimit) throw new Error(`Local draft storage accepts at most ${localDraftLimit} resources. Remove an older draft and try again.`)
  const payload = JSON.stringify({ version: 1, drafts })
  if (new TextEncoder().encode(payload).byteLength > localDraftByteLimit) throw new Error('Local drafts exceed the 256 KiB storage limit. Remove an older draft and try again.')
  memoryDrafts = drafts
  localStorageIfAvailable()?.setItem(localDraftStorageKey, payload)
}

export const listLocalDrafts = (kind: PbxResourceKind): PbxResource[] => readLocalDrafts().filter(draft => draft.kind === kind)
export const removeLocalDraft = (kind: PbxResourceKind, id: string): void => writeLocalDrafts(readLocalDrafts().filter(draft => draft.kind !== kind || draft.id !== id))

const saveLocalDraft = (resource: PbxResource): PbxResource => {
  const stored: PbxResource = { ...resource, revision: resource.revision, updatedAt: new Date().toISOString(), provenance: 'local-draft', pendingReview: true }
  const drafts = readLocalDrafts()
  const index = drafts.findIndex(item => item.kind === stored.kind && item.id === stored.id)
  if (index >= 0) drafts[index] = stored
  else drafts.push(stored)
  writeLocalDrafts(drafts)
  return stored
}

export class DisconnectedMaterialPbxClient implements MaterialPbxClient {
  readonly state: ConnectionState = 'disconnected'
  async preflight(): Promise<PreflightResult> { return { ok: false, state: 'disconnected', message: disconnectedMessage } }
  async health(): Promise<HealthSnapshot> { return { state: 'disconnected', serverName: 'No server connected', activeCalls: 0, registeredDevices: 0, warnings: [disconnectedMessage], checkedAt: new Date().toISOString() } }
  async capabilities(): Promise<CapabilitySnapshot> { return { schemaVersion: 1, generatedAt: new Date(0).toISOString(), degraded: true, warnings: [disconnectedMessage], capabilities: [] } }
  async list(kind: PbxResourceKind): Promise<PbxResource[]> { return listLocalDrafts(kind) }
  async save(resource: PbxResource): Promise<SaveResult> {
    try { return { ok: true, resource: saveLocalDraft(resource), storedLocally: true, message: disconnectedMessage } }
    catch (error) { return { ok: false, resource, storedLocally: false, message: error instanceof Error ? error.message : 'The local draft was not saved.' } }
  }
  async remove(kind: PbxResourceKind, id: string): Promise<SaveResult> {
    try { removeLocalDraft(kind, id); return { ok: true, storedLocally: true, message: disconnectedMessage } }
    catch (error) { return { ok: false, storedLocally: false, message: error instanceof Error ? error.message : 'The local draft was not removed.' } }
  }
  async validateTestCall(_destination: string): Promise<SaveResult> { return { ok: false, message: 'A test call needs a connected PBX and a confirmed emergency-calling policy.' } }
}

export class MaterialPbxRequestError extends Error {
  readonly state: ConnectionState

  constructor(state: ConnectionState, message: string) {
    super(message)
    this.state = state
  }
}
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const kinds = (value: unknown) => strings(value).filter((item): item is PbxResourceKind => resourceKinds.includes(item as PbxResourceKind))

const mapResource = (value: unknown, expectedKind?: PbxResourceKind): PbxResource | null => {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string' || typeof value.updatedAt !== 'string' || typeof value.enabled !== 'boolean') return null
  const kind = typeof value.kind === 'string' && resourceKinds.includes(value.kind as PbxResourceKind) ? value.kind as PbxResourceKind : expectedKind
  if (!kind || !isObject(value.configuration)) return null
  return {
    id: value.id,
    kind,
    name: value.displayName,
    summary: '',
    enabled: value.enabled,
    tags: [],
    updatedAt: value.updatedAt,
    revision: typeof value.revision === 'number' && Number.isInteger(value.revision) ? value.revision : undefined,
    details: value.configuration,
    provenance: 'server',
    pendingReview: false,
  }
}

const mapApplication = (value: unknown): NativeApplicationOutcome | undefined => {
  if (!isObject(value) || typeof value.applied !== 'boolean' || typeof value.reloaded !== 'boolean' || typeof value.runtimeVerification !== 'string' || typeof value.partialFailure !== 'boolean') return undefined
  return {
    storedDesired: typeof value.storedDesired === 'boolean' ? value.storedDesired : undefined,
    applied: value.applied,
    reloaded: value.reloaded,
    runtimeVerification: value.runtimeVerification,
    partialFailure: value.partialFailure,
    compilation: isObject(value.compilation) ? value.compilation : undefined,
    rollback: isObject(value.rollback) ? value.rollback : undefined,
    warning: typeof value.warning === 'string' || value.warning === null ? value.warning : undefined,
  }
}

function normalizeEndpoint(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol)) throw new MaterialPbxRequestError('incompatible', 'Use an HTTPS server address. HTTP is accepted only for loopback development.')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new MaterialPbxRequestError('incompatible', 'Unencrypted HTTP is allowed only for a loopback development server.')
  url.username = ''; url.password = ''; url.hash = ''; url.search = ''; url.pathname = url.pathname.replace(/\/$/, '')
  return url.toString().replace(/\/$/, '')
}

export class HttpMaterialPbxClient implements MaterialPbxClient {
  private connectionState: ConnectionState = 'disconnected'
  private readonly endpoint: string
  private readonly adminCredential: string
  private readonly fetcher: typeof fetch

  constructor(endpoint: string, adminCredential: string, fetcher: typeof fetch = fetch) {
    this.endpoint = normalizeEndpoint(endpoint)
    this.adminCredential = adminCredential
    this.fetcher = fetcher
  }
  get state() { return this.connectionState }

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController(); const timeout = globalThis.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await this.fetcher(`${this.endpoint}${path}`, { ...init, credentials: 'omit', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', ...(this.adminCredential ? { Authorization: `Bearer ${this.adminCredential}` } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } })
      if (response.status === 401 || response.status === 403) throw new MaterialPbxRequestError('permission-denied', 'The server is reachable, but the current session credential lacks permission. Enter a permitted admin credential and retry.')
      if (response.status === 404 || response.status === 426) throw new MaterialPbxRequestError('incompatible', 'The server does not expose the compatible MaterialPBX control API. Update the control service or correct the endpoint.')
      if (!response.ok) throw new MaterialPbxRequestError('degraded', `The control service returned HTTP ${response.status}. No change was applied.`)
      const text = await response.text()
      if (text.length > 2_000_000) throw new MaterialPbxRequestError('incompatible', 'The control service response exceeded the 2 MB safety limit.')
      try { return text ? JSON.parse(text) as unknown : {} } catch { throw new MaterialPbxRequestError('incompatible', 'The control service returned invalid JSON.') }
    } catch (error) {
      if (error instanceof MaterialPbxRequestError) throw error
      throw new MaterialPbxRequestError('offline', error instanceof DOMException && error.name === 'AbortError' ? 'The control service did not answer within 8 seconds.' : 'The control service could not be reached. Check its address, certificate, network, and firewall.')
    } finally { globalThis.clearTimeout(timeout) }
  }

  async health(): Promise<HealthSnapshot> {
    const value = await this.request('/healthz', { headers: { Authorization: '' } })
    if (!isObject(value) || value.status !== 'ok' || typeof value.time !== 'string') throw new MaterialPbxRequestError('incompatible', 'The public health response is missing status ok and an ISO timestamp.')
    return { state: 'connected', serverName: 'MaterialPBX control service', warnings: [], checkedAt: value.time }
  }
  async capabilities(): Promise<CapabilitySnapshot> {
    const value = await this.request('/v1/system/capability-registry')
    if (!isObject(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== 'string' || typeof value.degraded !== 'boolean' || !Array.isArray(value.capabilities)) throw new MaterialPbxRequestError('incompatible', 'The capability registry does not match schema version 1.')
    return value as unknown as CapabilitySnapshot
  }
  private async systemStatus(): Promise<SystemStatusSnapshot> { const value = await this.request('/v1/system/status'); if (!isObject(value) || !isObject(value.identity) || !isObject(value.adapters) || !Array.isArray(value.warnings)) throw new MaterialPbxRequestError('incompatible', 'The authenticated system status response is incomplete.'); return value as unknown as SystemStatusSnapshot }
  async preflight(): Promise<PreflightResult> {
    this.connectionState = 'connecting'
    try { const health = await this.health(); const [status, capabilities] = await Promise.all([this.systemStatus(), this.capabilities()]); const identityName = [status.identity.displayName, status.identity.name, status.identity.id].find((item): item is string => typeof item === 'string') ?? 'MaterialPBX control service'; health.serverName = identityName; health.warnings = [...status.warnings, ...capabilities.warnings]; health.state = capabilities.degraded || health.warnings.length ? 'degraded' : 'connected'; this.connectionState = health.state; return { ok: true, state: health.state, message: health.state === 'degraded' ? 'Connected with evidence-backed server warnings. Review them before applying changes.' : 'Connected to the MaterialPBX control service.', health, capabilities, status } }
    catch (error) { const failure = error instanceof MaterialPbxRequestError ? error : new MaterialPbxRequestError('offline', 'The control service preflight failed.'); this.connectionState = failure.state; return { ok: false, state: failure.state, message: failure.message } }
  }
  async list(kind: PbxResourceKind): Promise<PbxResource[]> {
    const value = await this.request(`/v1/resources?kind=${encodeURIComponent(kind)}`)
    const items = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.items) ? value.items : null
    if (!items) throw new MaterialPbxRequestError('incompatible', `The ${kind} response does not contain a resource list.`)
    return items.map(item => mapResource(item, kind)).filter((item): item is PbxResource => item !== null)
  }
  async save(resource: PbxResource): Promise<SaveResult> {
    try {
      const mutation = { displayName: resource.name, enabled: resource.enabled, ...(resource.revision === undefined ? {} : { expectedRevision: resource.revision }), configuration: resource.details ?? {} }
      const value = await this.request(`/v1/resources/${encodeURIComponent(resource.kind)}/${encodeURIComponent(resource.id)}`, { method: 'PUT', body: JSON.stringify(mutation) })
      const application = isObject(value) ? mapApplication(value.application) : undefined
      const saved = isObject(value) ? mapResource(value.resource, resource.kind) : null
      const outcome = application ? ` Native application: ${application.applied ? 'applied' : 'not applied'}; reload: ${application.reloaded ? 'completed' : 'not completed'}; runtime verification: ${application.runtimeVerification}.` : ''
      return { ok: true, resource: saved ?? resource, application, message: `The control service saved the resource.${outcome}` }
    } catch (error) {
      return { ok: false, resource, message: error instanceof Error ? error.message : 'The resource was not saved.', state: error instanceof MaterialPbxRequestError ? error.state : 'degraded' }
    }
  }
  async remove(kind: PbxResourceKind, id: string): Promise<SaveResult> {
    try {
      const value = await this.request(`/v1/resources/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const application = isObject(value) ? mapApplication(value.application) : undefined
      const outcome = application ? ` Native removal: ${application.applied ? 'applied' : 'not applied'}; reload: ${application.reloaded ? 'completed' : 'not completed'}; runtime verification: ${application.runtimeVerification}.` : ''
      return { ok: true, application, message: `The control service removed the stored resource.${outcome}` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'The resource was not removed.', state: error instanceof MaterialPbxRequestError ? error.state : 'degraded' }
    }
  }
  async validateTestCall(_destination: string): Promise<SaveResult> { return { ok: false, message: 'This control-service contract does not expose a test-call validation action. The destination was not sent and no call was placed.' } }
}

export const createDisconnectedClient = (): MaterialPbxClient => new DisconnectedMaterialPbxClient()
export const createHttpClient = (endpoint: string, adminCredential: string): MaterialPbxClient => new HttpMaterialPbxClient(endpoint, adminCredential)
