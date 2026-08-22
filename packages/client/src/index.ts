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
  details?: Record<string, string | number | boolean | string[]>
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
export interface SaveResult { ok: boolean; resource?: PbxResource; message: string; state?: ConnectionState }

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

export class DisconnectedMaterialPbxClient implements MaterialPbxClient {
  readonly state: ConnectionState = 'disconnected'
  async preflight(): Promise<PreflightResult> { return { ok: false, state: 'disconnected', message: disconnectedMessage } }
  async health(): Promise<HealthSnapshot> { return { state: 'disconnected', serverName: 'No server connected', activeCalls: 0, registeredDevices: 0, warnings: [disconnectedMessage], checkedAt: new Date().toISOString() } }
  async capabilities(): Promise<CapabilitySnapshot> { return { schemaVersion: 1, generatedAt: new Date(0).toISOString(), degraded: true, warnings: [disconnectedMessage], capabilities: [] } }
  async list(_kind: PbxResourceKind): Promise<PbxResource[]> { return [] }
  async save(resource: PbxResource): Promise<SaveResult> { return { ok: false, resource, message: disconnectedMessage } }
  async remove(_kind: PbxResourceKind, _id: string): Promise<SaveResult> { return { ok: false, message: disconnectedMessage } }
  async validateTestCall(_destination: string): Promise<SaveResult> { return { ok: false, message: 'A test call needs a connected PBX and a confirmed emergency-calling policy.' } }
}

export class MaterialPbxRequestError extends Error { constructor(readonly state: ConnectionState, message: string) { super(message) } }
const resourceKinds: PbxResourceKind[] = ['extensions','users','devices','trunks','inbound-routes','outbound-routes','ivrs','queues','ring-groups','conferences','voicemail','recordings','cdr','cel','calendars','presence','parking','paging','announcements','time-conditions','webrtc','paired-servers','backups','observability','security']
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const kinds = (value: unknown) => strings(value).filter((item): item is PbxResourceKind => resourceKinds.includes(item as PbxResourceKind))

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
  constructor(endpoint: string, private readonly adminCredential: string, private readonly fetcher: typeof fetch = fetch) { this.endpoint = normalizeEndpoint(endpoint) }
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
    return items.filter(isObject).flatMap((item) => typeof item.id === 'string' && typeof item.name === 'string' ? [{ id: item.id, kind, name: item.name, summary: typeof item.summary === 'string' ? item.summary : '', enabled: item.enabled !== false, tags: strings(item.tags), updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '', details: isObject(item.details) ? item.details as PbxResource['details'] : undefined }] : [])
  }
  async save(resource: PbxResource): Promise<SaveResult> {
    try {
      const value = await this.request(`/v1/resources/${encodeURIComponent(resource.kind)}/${encodeURIComponent(resource.id)}`, { method: 'PUT', body: JSON.stringify(resource) })
      return { ok: true, resource: isObject(value) && isObject(value.resource) ? { ...resource, ...value.resource } as PbxResource : resource, message: 'The control service accepted and returned the saved resource.' }
    } catch (error) {
      return { ok: false, resource, message: error instanceof Error ? error.message : 'The resource was not saved.', state: error instanceof MaterialPbxRequestError ? error.state : 'degraded' }
    }
  }
  async remove(kind: PbxResourceKind, id: string): Promise<SaveResult> {
    try {
      await this.request(`/v1/resources/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return { ok: true, message: 'The control service confirmed removal.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'The resource was not removed.', state: error instanceof MaterialPbxRequestError ? error.state : 'degraded' }
    }
  }
  async validateTestCall(_destination: string): Promise<SaveResult> { return { ok: false, message: 'This control-service contract does not expose a test-call validation action. The destination was not sent and no call was placed.' } }
}

export const createDisconnectedClient = (): MaterialPbxClient => new DisconnectedMaterialPbxClient()
export const createHttpClient = (endpoint: string, adminCredential: string): MaterialPbxClient => new HttpMaterialPbxClient(endpoint, adminCredential)
