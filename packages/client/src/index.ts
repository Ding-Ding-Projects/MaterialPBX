export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded'

export type PbxResourceKind =
  | 'extensions' | 'users' | 'devices' | 'trunks' | 'inbound-routes' | 'outbound-routes'
  | 'ivrs' | 'queues' | 'conferences' | 'voicemail' | 'recordings' | 'cdr' | 'cel'
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
}

export interface HealthSnapshot {
  state: ConnectionState
  serverName: string
  asteriskVersion?: string
  freePbxVersion?: string
  activeCalls: number
  registeredDevices: number
  warnings: string[]
  checkedAt: string
}

export interface SaveResult {
  ok: boolean
  resource?: PbxResource
  message: string
}

export interface MaterialPbxClient {
  readonly state: ConnectionState
  health(): Promise<HealthSnapshot>
  list(kind: PbxResourceKind): Promise<PbxResource[]>
  save(resource: PbxResource): Promise<SaveResult>
  remove(kind: PbxResourceKind, id: string): Promise<SaveResult>
  validateTestCall(destination: string): Promise<SaveResult>
}

const disconnectedMessage = 'No PBX is connected. Changes remain local until you connect a server.'

export class DisconnectedMaterialPbxClient implements MaterialPbxClient {
  readonly state: ConnectionState = 'disconnected'

  async health(): Promise<HealthSnapshot> {
    return {
      state: 'disconnected',
      serverName: 'No server connected',
      activeCalls: 0,
      registeredDevices: 0,
      warnings: [disconnectedMessage],
      checkedAt: new Date().toISOString(),
    }
  }

  async list(_kind: PbxResourceKind): Promise<PbxResource[]> { return [] }

  async save(resource: PbxResource): Promise<SaveResult> {
    return { ok: false, resource, message: disconnectedMessage }
  }

  async remove(_kind: PbxResourceKind, _id: string): Promise<SaveResult> {
    return { ok: false, message: disconnectedMessage }
  }

  async validateTestCall(_destination: string): Promise<SaveResult> {
    return { ok: false, message: 'A test call needs a connected PBX and a confirmed emergency-calling policy.' }
  }
}

export const createDisconnectedClient = (): MaterialPbxClient => new DisconnectedMaterialPbxClient()

