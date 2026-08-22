<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { createDisconnectedClient, createHttpClient, MaterialPbxRequestError, type CapabilitySnapshot, type ConnectionState, type HealthSnapshot, type MaterialPbxClient, type PbxResource, type PbxResourceKind } from '@materialpbx/client'
import { contrastRatio, RAINBOW_SENTINEL, translateColor } from './color'
import { compileSearch } from './regex'

const props = withDefaults(defineProps<{ surface?: 'web' | 'desktop' | 'site' }>(), { surface: 'web' })
const client = shallowRef<MaterialPbxClient>(createDisconnectedClient())

type LanguageMode = 'en' | 'zh-HK' | 'bilingual'
type Dock = 'left' | 'right' | 'top' | 'bottom'
type PageId = PbxResourceKind | 'home' | 'onboarding' | 'status' | 'settings' | 'docs' | 'authenticator' | 'history' | 'notifications' | 'changelog' | 'locks' | 'support'

interface Settings {
  language: LanguageMode
  funnyEnglish: number
  funnyCantonese: number
  dialogEmoji: boolean
  schoolMode: boolean
  schoolName: string
  narrator: boolean
  narratorLanguage: 'en' | 'zh-HK' | 'both'
  englishVoice: string
  cantoneseVoice: string
  speechRate: number
  speechPitch: number
  theme: 'light' | 'dark' | 'system'
  density: 'comfortable' | 'compact' | 'spacious'
  accent: string
  rainbow: boolean
  rainbowSpeed: number
  fontFamily: string
  fontScale: number
  appName: string
  dock: Dock
  reducedMotion: boolean
  adhdFocus: boolean
  adhdLowStim: boolean
  adhdTime: boolean
  adhdOneThing: boolean
  adhdMomentum: boolean
  nextAction: string
}

const defaults: Settings = {
  language: 'en', funnyEnglish: 5, funnyCantonese: 5, dialogEmoji: true,
  schoolMode: false, schoolName: 'School mode', narrator: false, narratorLanguage: 'en',
  englishVoice: '', cantoneseVoice: '', speechRate: 1, speechPitch: 1,
  theme: 'system', density: 'comfortable', accent: '#6750A4', rainbow: false, rainbowSpeed: 3,
  fontFamily: 'Roboto, system-ui, sans-serif', fontScale: 1, appName: 'MaterialPBX', dock: 'left',
  reducedMotion: false, adhdFocus: false, adhdLowStim: false, adhdTime: false,
  adhdOneThing: false, adhdMomentum: false, nextAction: '',
}

const stored = localStorage.getItem('materialpbx.settings.v1')
const settings = reactive<Settings>({ ...defaults, ...(stored ? JSON.parse(stored) : {}) })
watch(settings, (value) => localStorage.setItem('materialpbx.settings.v1', JSON.stringify(value)), { deep: true })

const pages: Array<{ id: PageId; label: string; icon: string; group: string; description: string }> = [
  { id: 'home', label: 'Home', icon: 'home', group: 'Start', description: 'See server health and the next safe actions.' },
  { id: 'onboarding', label: 'Guided setup', icon: 'rocket_launch', group: 'Start', description: 'Connect phones and calling one explained step at a time.' },
  { id: 'extensions', label: 'Extensions', icon: 'dialpad', group: 'People & phones', description: 'Short internal numbers people dial to reach each other.' },
  { id: 'users', label: 'People', icon: 'group', group: 'People & phones', description: 'People who receive calls, voicemail, and permissions.' },
  { id: 'devices', label: 'Phones & devices', icon: 'phonelink_ring', group: 'People & phones', description: 'Desk phones, softphones, and browser calling.' },
  { id: 'trunks', label: 'Phone companies', icon: 'cell_tower', group: 'Calling', description: 'Connections that carry calls between your PBX and public phone numbers.' },
  { id: 'inbound-routes', label: 'Incoming calls', icon: 'call_received', group: 'Calling', description: 'Choose where each public phone number rings.' },
  { id: 'outbound-routes', label: 'Outgoing calls', icon: 'call_made', group: 'Calling', description: 'Choose which phone company carries each kind of number.' },
  { id: 'ivrs', label: 'Phone menus', icon: 'account_tree', group: 'Call flows', description: 'Let callers press keys to choose where they go.' },
  { id: 'queues', label: 'Waiting lines', icon: 'queue', group: 'Call flows', description: 'Hold callers and offer them to available team members.' },
  { id: 'conferences', label: 'Conference rooms', icon: 'groups_3', group: 'Call flows', description: 'Shared numbers where several people can talk together.' },
  { id: 'voicemail', label: 'Voicemail', icon: 'voicemail', group: 'Call flows', description: 'Record messages when nobody can answer.' },
  { id: 'recordings', label: 'Recordings', icon: 'graphic_eq', group: 'Call flows', description: 'Greetings, announcements, music, and call recordings.' },
  { id: 'announcements', label: 'Announcements', icon: 'campaign', group: 'Call flows', description: 'Play a message before sending the caller onward.' },
  { id: 'time-conditions', label: 'Opening hours', icon: 'schedule', group: 'Call flows', description: 'Send calls differently when the office is closed.' },
  { id: 'cdr', label: 'Call history', icon: 'receipt_long', group: 'Reports', description: 'One row for each completed call.' },
  { id: 'cel', label: 'Call events', icon: 'timeline', group: 'Reports', description: 'Detailed events explaining what happened during a call.' },
  { id: 'observability', label: 'Live operations', icon: 'monitor_heart', group: 'Reports', description: 'Health, registrations, channels, queues, and service logs.' },
  { id: 'calendars', label: 'Calendars', icon: 'calendar_month', group: 'Advanced', description: 'Use calendar events to control call behavior.' },
  { id: 'presence', label: 'Presence', icon: 'person_pin_circle', group: 'Advanced', description: 'Show whether a person or phone is available.' },
  { id: 'parking', label: 'Call parking', icon: 'local_parking', group: 'Advanced', description: 'Place a call in a numbered space for another phone to retrieve.' },
  { id: 'paging', label: 'Paging & intercom', icon: 'record_voice_over', group: 'Advanced', description: 'Speak through one or many phones without a normal ring.' },
  { id: 'webrtc', label: 'Browser calling', icon: 'language', group: 'Advanced', description: 'Make encrypted calls in a supported web browser.' },
  { id: 'paired-servers', label: 'Paired PBX servers', icon: 'hub', group: 'Advanced', description: 'Connect another compatible PBX through a verified, encrypted pairing.' },
  { id: 'backups', label: 'Backups', icon: 'backup', group: 'System', description: 'Create, verify, restore, and schedule recoverable copies.' },
  { id: 'security', label: 'Security', icon: 'shield', group: 'System', description: 'Firewall, certificates, encryption, permissions, and audit events.' },
  { id: 'status', label: 'Status Hub', icon: 'dashboard_customize', group: 'System', description: 'Evidence-backed project and service status.' },
  { id: 'authenticator', label: 'Authenticator', icon: 'password', group: 'Tools', description: 'Local time-based codes stored by the desktop app credential vault.' },
  { id: 'history', label: 'Local history', icon: 'history', group: 'Tools', description: 'Review and restore changes without rewriting earlier history.' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications', group: 'Tools', description: 'Review informational, warning, and error messages.' },
  { id: 'locks', label: 'Toy locks', icon: 'lock', group: 'Tools', description: 'Add optional local speed bumps to individual interface elements.' },
  { id: 'changelog', label: 'Changelog', icon: 'new_releases', group: 'Help', description: 'Browse released versions, dates, changes, and source commits.' },
  { id: 'support', label: 'Support Tickets', icon: 'support_agent', group: 'Help', description: 'Create fictional local tickets that explain the self-service recovery path.' },
  { id: 'docs', label: 'Offline guide', icon: 'menu_book', group: 'Help', description: 'Bundled help that works without an internet connection.' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Help', description: 'Language, appearance, accessibility, schedules, and integrations.' },
]

const activePage = ref<PageId>('home')
const page = computed(() => pages.find((item) => item.id === activePage.value) ?? pages[0])
const openTabs = ref<PageId[]>(['home', 'onboarding'])
const pinnedTabs = ref<PageId[]>(['home'])
const tabGroups = ref([{ id: 'daily', name: 'Daily work', color: '#6750A4', collapsed: false, members: ['home'] as PageId[] }])
const navSearch = reactive({ query: '', regex: false, flags: 'i' })
const navRegexOpen = ref(false)
const navCompiled = computed(() => compileSearch(navSearch))
const regexDialogOpen = ref(false)
const regexContext = ref('Search')
const regexDraft = reactive({ query: '', regex: false, flags: 'i' })
const regexDraftResult = computed(() => compileSearch(regexDraft))
function openRegexBuilder(context: string) { regexContext.value = context; regexDialogOpen.value = true }
const filteredPages = computed(() => pages.filter((item) => navCompiled.value.matcher(`${item.label} ${item.description} ${item.group}`)))

function openPage(id: PageId) {
  activePage.value = id
  if (!openTabs.value.includes(id)) openTabs.value.push(id)
  recordHistory(`Opened ${pages.find((item) => item.id === id)?.label ?? id}`)
}

function closeTab(id: PageId) {
  if (pinnedTabs.value.includes(id)) return notify('Pinned tab', 'Unpin this tab before closing it.', 'warning')
  openTabs.value = openTabs.value.filter((tab) => tab !== id)
  if (activePage.value === id) activePage.value = openTabs.value.at(-1) ?? 'home'
}

const connection = ref<ConnectionState>('disconnected')
const serverUrl = ref(localStorage.getItem('materialpbx.control-endpoint.v1') ?? '')
const serverCredential = ref('')
const connectDialog = ref(false)
const connectionMessage = ref('No control service has been preflighted in this browser session.')
const healthSnapshot = ref<HealthSnapshot | null>(null)
const capabilitySnapshot = ref<CapabilitySnapshot | null>(null)
const resourceRows = ref<Partial<Record<PbxResourceKind, PbxResource[]>>>({})
const resourceAccess = ref<Partial<Record<PbxResourceKind, 'unknown' | 'read' | 'write' | 'read-only' | 'denied'>>>({})
const resourceLoading = ref(false)
const expertMode = ref(false)

const resourcePageIds = new Set<PbxResourceKind>(['extensions','users','devices','trunks','inbound-routes','outbound-routes','ivrs','queues','conferences','voicemail','recordings','cdr','cel','calendars','presence','parking','paging','announcements','time-conditions','webrtc','paired-servers','backups','observability','security'])
const isResourcePage = (value: PageId): value is PbxResourceKind => resourcePageIds.has(value as PbxResourceKind)
const currentAccess = computed(() => isResourcePage(activePage.value) ? resourceAccess.value[activePage.value] ?? 'unknown' : 'unknown')
const canWriteCurrent = computed(() => currentAccess.value === 'write')
const canAttemptWriteCurrent = computed(() => !['read-only', 'denied'].includes(currentAccess.value))
const currentResources = computed(() => isResourcePage(activePage.value) ? resourceRows.value[activePage.value] ?? [] : [])
const connectionLabel = computed(() => props.surface === 'site' ? 'Documentation site' : ({ disconnected: 'Disconnected', connecting: 'Checking server', connected: 'Live connection', degraded: 'Live with warnings', offline: 'Server offline', 'permission-denied': 'Permission needed', incompatible: 'Incompatible server' }[connection.value]))
const connectionColor = computed(() => props.surface === 'site' ? 'info' : ({ connected: 'success', degraded: 'warning', connecting: 'info', disconnected: 'warning', offline: 'error', 'permission-denied': 'warning', incompatible: 'error' }[connection.value]))

async function loadResources(kind: PbxResourceKind) {
  if (!['connected', 'degraded'].includes(connection.value)) return
  resourceLoading.value = true
  try { resourceRows.value[kind] = await client.value.list(kind); if (resourceAccess.value[kind] !== 'write') resourceAccess.value[kind] = 'read' }
  catch (error) { if (error instanceof MaterialPbxRequestError && error.state === 'permission-denied') resourceAccess.value[kind] = 'denied'; notify('Could not load PBX records', error instanceof Error ? error.message : 'The server returned an unreadable resource list.', error instanceof MaterialPbxRequestError && error.state === 'permission-denied' ? 'warning' : 'error') }
  finally { resourceLoading.value = false }
}

async function runPreflight() {
  connection.value = 'connecting'; connectionMessage.value = 'Checking the control service, API compatibility, permissions, and PBX health.'
  try { client.value = createHttpClient(serverUrl.value, serverCredential.value); serverCredential.value = '' }
  catch (error) { connection.value = 'incompatible'; connectionMessage.value = error instanceof Error ? error.message : 'Enter a valid HTTPS endpoint.'; return }
  const result = await client.value.preflight(); connection.value = result.state; connectionMessage.value = result.message
  if (!result.ok) { healthSnapshot.value = null; capabilitySnapshot.value = null; notify('Connection preflight did not pass', result.message, result.state === 'permission-denied' ? 'warning' : 'error'); return }
  healthSnapshot.value = result.health ?? null; capabilitySnapshot.value = result.capabilities ?? null
  localStorage.setItem('materialpbx.control-endpoint.v1', serverUrl.value.trim().replace(/\/$/, ''))
  connectDialog.value = false; notify('Control service connected', `${result.health?.serverName ?? 'PBX'} returned capability registry schema ${result.capabilities?.schemaVersion ?? 'unknown'} with ${result.capabilities?.capabilities.length ?? 0} evidence-backed entries.`, result.state === 'degraded' ? 'warning' : 'success')
  if (isResourcePage(activePage.value)) await loadResources(activePage.value)
}

function disconnectServer() {
  client.value = createDisconnectedClient(); connection.value = 'disconnected'; connectionMessage.value = 'Disconnected by this user. The saved endpoint remains available for the next preflight.'; healthSnapshot.value = null; capabilitySnapshot.value = null; resourceRows.value = {}; resourceAccess.value = {}; serverCredential.value = ''; notify('Control service disconnected', 'The in-memory credential was discarded. No live PBX changes can be made until preflight succeeds again.', 'info')
}
function clearSavedEndpoint() { localStorage.removeItem('materialpbx.control-endpoint.v1'); serverUrl.value = ''; notify('Saved endpoint cleared', 'Only the non-secret server address was removed. No credential was stored here.', 'info') }

const onboardingStep = ref(1)
const onboarding = reactive({
  serverName: 'My phone system', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  country: 'CA', emergencyNumber: '911', emergencyConfirmed: false, extensionStart: 100,
  extensionDigits: 3, deviceType: 'softphone', provider: 'I will connect a phone company later',
  publicNumber: '', nat: 'automatic', firewall: 'recommended', tls: true, srtp: true,
  backupSchedule: 'Every night', testDestination: '',
})

const resourceForms: Record<string, Array<{ key: string; label: string; type: string; options?: string[]; help: string }>> = {
  extensions: [
    { key: 'number', label: 'Extension number', type: 'number', help: 'A short internal number, such as 101.' },
    { key: 'person', label: 'Person', type: 'select', options: ['Create a new person', 'Unassigned'], help: 'The person who receives calls at this extension.' },
    { key: 'ringSeconds', label: 'Ring time', type: 'slider', help: 'How long the phone rings before the next action.' },
    { key: 'voicemail', label: 'Voicemail', type: 'switch', help: 'Record a message when this extension is not answered.' },
  ],
  trunks: [
    { key: 'technology', label: 'Connection technology', type: 'select', options: ['pjsip'], help: 'The current bounded compiler supports PJSIP.' },
    { key: 'host', label: 'Provider host or IP address', type: 'text', help: 'Use the exact DNS name or address supplied by your provider.' },
    { key: 'port', label: 'Port', type: 'number', help: 'Normally 5060 for UDP/TCP and 5061 for TLS; use your provider’s documented value.' },
    { key: 'provider', label: 'Phone company profile', type: 'select', options: ['Generic SIP', 'Pair another PBX', 'Custom verified profile'], help: 'A guided profile supplies safe defaults.' },
    { key: 'transport', label: 'Call transport', type: 'select', options: ['tls', 'tcp', 'udp'], help: 'TLS encrypts signaling when the provider supports it. Use lowercase protocol values in expert mode.' },
    { key: 'media', label: 'Voice encryption', type: 'select', options: ['SRTP (recommended)', 'Provider default', 'RTP'], help: 'SRTP encrypts the voice stream when both sides support it.' },
    { key: 'concurrency', label: 'Maximum simultaneous calls', type: 'slider', help: 'Prevents this connection from accepting more calls than purchased.' },
  ],
  'inbound-routes': [
    { key: 'name', label: 'Route name', type: 'text', help: 'A plain label, such as Main number during office hours.' },
    { key: 'publicNumber', label: 'Public phone number', type: 'text', help: 'Use the full country code, such as +14165550100.' },
    { key: 'didPattern', label: 'DID pattern', type: 'text', help: 'Use digits, X, Z, N, and supported Asterisk pattern characters.' },
    { key: 'callerIdPattern', label: 'Caller ID pattern', type: 'text', help: 'Optional. Use the same bounded pattern syntax.' },
    { key: 'destination', label: 'First destination', type: 'select', options: ['Queue','Extension','Phone menu','Announcement','Voicemail'], help: 'The first place an incoming call should go.' },
    { key: 'enabled', label: 'Accept calls on this route', type: 'switch', help: 'Turn the route off without deleting its call plan.' },
  ],
  'outbound-routes': [
    { key: 'name', label: 'Route name', type: 'text', help: 'A label such as Canada and US calls.' },
    { key: 'dialPatterns', label: 'Dial patterns', type: 'members', help: 'Add each pattern using digits, X, Z, N, and supported Asterisk pattern syntax.' },
    { key: 'trunkIds', label: 'Trunk order', type: 'members', help: 'Add trunk identifiers in the order they should be tried. Emergency routes allow exactly one.' },
    { key: 'provider', label: 'Preferred phone company', type: 'select', options: ['First healthy trunk','Ask me after trunks load'], help: 'The server validates this choice against live trunks.' },
    { key: 'emergency', label: 'Emergency route', type: 'switch', help: 'Emergency routes require a verified provider address and approved test procedure.' },
  ],
  ivrs: [
    { key: 'name', label: 'Menu name', type: 'text', help: 'A caller-friendly purpose, such as Main welcome menu.' },
    { key: 'recording', label: 'Greeting', type: 'select', options: ['Choose a verified recording','Record a new greeting'], help: 'Callers hear this before choosing a key.' },
    { key: 'entries', label: 'Key choices', type: 'members', help: 'Add one digit and its destination per choice, using digits 0–9, *, or #.' },
    { key: 'timeoutSeconds', label: 'Menu timeout seconds', type: 'number', help: 'How long the menu waits before the safe fallback, from 1 to 60 seconds.' },
    { key: 'timeout', label: 'Seconds to wait', type: 'slider', help: 'How long the menu waits before its no-answer destination.' },
    { key: 'invalidDestination', label: 'Invalid key destination', type: 'select', options: ['Repeat menu','Operator extension','Voicemail','Hang up'], help: 'The safe next step after an unavailable key.' },
  ],
  queues: [
    { key: 'name', label: 'Waiting-line name', type: 'text', help: 'A clear team or purpose, such as Customer care.' },
    { key: 'strategy', label: 'Who rings next', type: 'select', options: ['Longest idle (recommended)','Ring everyone','Round robin','Fewest calls'], help: 'The server maps this plain choice to the queue strategy.' },
    { key: 'memberExtensionIds', label: 'Members', type: 'members', help: 'Add short extension numbers that should receive calls.' },
    { key: 'ringSeconds', label: 'Seconds per attempt', type: 'slider', help: 'How long each available phone rings.' },
    { key: 'timeoutSeconds', label: 'Queue timeout seconds', type: 'number', help: 'How long callers may remain in the queue before the safe fallback.' },
    { key: 'maxWait', label: 'Maximum wait', type: 'select', options: ['5 minutes','10 minutes','20 minutes','No fixed limit'], help: 'After this, send the caller to the fallback destination.' },
  ],
  voicemail: [
    { key: 'mailbox', label: 'Mailbox number', type: 'number', help: 'A validated 2 to 12 digit numeric mailbox.' },
    { key: 'email', label: 'Notification email', type: 'text', help: 'Optional. Used only when the server has a verified mail route.' },
    { key: 'attachAudio', label: 'Attach audio to email notifications', type: 'switch', help: 'Include the recorded message when email delivery is configured.' },
    { key: 'maxMessageSeconds', label: 'Maximum message seconds', type: 'number', help: 'Between 10 and 3600 seconds.' },
  ],
  'time-conditions': [
    { key: 'timezone', label: 'Timezone', type: 'text', help: 'Use an IANA timezone identifier such as America/Toronto or Asia/Hong_Kong.' },
    { key: 'windows', label: 'Open windows', type: 'members', help: 'Add weekday/start/end windows in expert JSON form until the guided window editor ships.' },
    { key: 'matchedDestination', label: 'Matched destination', type: 'text', help: 'Destination identifier used during open hours.' },
    { key: 'unmatchedDestination', label: 'Unmatched destination', type: 'text', help: 'Destination identifier used outside open hours.' },
  ],
  observability: [
    { key: 'refresh', label: 'Refresh interval', type: 'select', options: ['10 seconds','30 seconds (recommended)','1 minute','Manual'], help: 'Slower refresh uses fewer server resources.' },
    { key: 'severity', label: 'Minimum event severity', type: 'select', options: ['Information','Warning','Error'], help: 'Filters the live operations feed without hiding PBX health.' },
    { key: 'channels', label: 'Show active channels', type: 'switch', help: 'Lists current call legs only when the server grants permission.' },
  ],
  'paired-servers': [
    { key: 'name', label: 'Other PBX name', type: 'text', help: 'A recognizable name for the other server.' },
    { key: 'endpoint', label: 'Other PBX HTTPS address', type: 'text', help: 'The pairing preflight verifies its certificate and compatible API.' },
    { key: 'mode', label: 'Pairing purpose', type: 'select', options: ['Private extension calling','Failover routes','Shared presence','Limited custom pairing'], help: 'Start with the narrowest capability set.' },
    { key: 'tls', label: 'Require encrypted signaling', type: 'switch', help: 'Recommended and enabled by default.' },
  ],
}

const visualFeatureKinds = new Set<PbxResourceKind>(['extensions','trunks','inbound-routes','outbound-routes','ivrs','queues','observability','paired-servers'])
const visualFeature = computed(() => isResourcePage(activePage.value) && visualFeatureKinds.has(activePage.value) ? ({
  extensions: { eyebrow: 'PEOPLE AND PHONES', lead: 'Give each person a short number and decide which real devices ring.', default: 'Suggested start: three-digit extensions beginning at 100, voicemail on, 25-second ring time.', icon: '☎' },
  trunks: { eyebrow: 'PHONE COMPANY LINKS', lead: 'Configure a bounded PJSIP connection and see which outside links are healthy, encrypted, and within their call limits.', default: 'Suggested start: PJSIP with TLS when supported, the provider’s documented host and port, then add credentials only through its reviewed flow.', icon: '⇄' },
  'inbound-routes': { eyebrow: 'INCOMING CALL MAP', lead: 'Match each public number to the first destination callers should reach.', default: 'Suggested start: send the main number to a staffed queue, with voicemail as the after-hours fallback.', icon: '↘' },
  'outbound-routes': { eyebrow: 'OUTGOING CALL MAP', lead: 'Choose which healthy phone-company connection carries each kind of number.', default: 'Suggested start: separate emergency, local, and international rules so permissions stay reviewable.', icon: '↗' },
  ivrs: { eyebrow: 'VISUAL CALL-FLOW CANVAS', lead: 'Build the caller journey from greeting to key choices and safe fallbacks.', default: 'Suggested start: operator on 0, repeat once after an invalid key, then use a clear fallback.', icon: '⑴' },
  queues: { eyebrow: 'WAITING-LINE CONTROL', lead: 'Balance caller wait time, available people, and a humane fallback.', default: 'Suggested start: longest-idle strategy, 20-second attempts, and a visible maximum wait.', icon: '≋' },
  observability: { eyebrow: 'LIVE OPERATIONS', lead: 'Read PBX health, active calls, registrations, warnings, and the exact time they were checked.', default: 'This view is read-only unless the server explicitly grants an action capability.', icon: '◉' },
  'paired-servers': { eyebrow: 'SERVER PAIRING', lead: 'Connect another compatible PBX with the smallest useful permission set.', default: 'Suggested start: encrypted private-extension calling only; add failover or presence after verification.', icon: '⛓' },
}[activePage.value] as { eyebrow: string; lead: string; default: string; icon: string }) : null)

const genericForm = [
  { key: 'name', label: 'Name', type: 'text', help: 'A clear label shown throughout MaterialPBX.' },
  { key: 'enabled', label: 'Enabled', type: 'switch', help: 'Turn this item on without deleting its settings.' },
  { key: 'destination', label: 'Next destination', type: 'select', options: ['Extension', 'Queue', 'Voicemail', 'Announcement', 'Hang up'], help: 'What should happen after this step.' },
]
const editorOpen = ref(false)
const editingResourceId = ref<string | null>(null)
const editorValues = reactive<Record<string, string | number | boolean>>({ name: '', enabled: true, ringSeconds: 25, concurrency: 4 })
const queueMembers = ref<Array<{ id: string; label: string }>>([])
const listMembers = ref<Array<{ id: string; label: string }>>([])
const currentForm = computed(() => resourceForms[activePage.value] ?? genericForm)
const membersKey = computed(() => currentForm.value.find((field) => field.type === 'members')?.key ?? '')
const activeMembers = computed(() => membersKey.value === 'memberExtensionIds' ? queueMembers.value : listMembers.value)
const membersEditorLabel = computed(() => ({ memberExtensionIds: 'Queue members', dialPatterns: 'Dial patterns', trunkIds: 'Trunk order', entries: 'IVR key choices', windows: 'Open windows' }[membersKey.value as 'memberExtensionIds' | 'dialPatterns' | 'trunkIds' | 'entries' | 'windows'] ?? 'Items'))
const membersFieldLabel = computed(() => ({ memberExtensionIds: 'Member extension or endpoint', dialPatterns: 'Asterisk dial pattern', trunkIds: 'Trunk identifier', entries: 'Key choice JSON, such as {"digit":"1","destination":{"type":"extension","id":"101"}}', windows: 'Window JSON, such as {"weekdays":[1],"start":"09:00","end":"17:00"}' }[membersKey.value as 'memberExtensionIds' | 'dialPatterns' | 'trunkIds' | 'entries' | 'windows'] ?? 'Identifier'))
const membersEmptyMessage = computed(() => membersKey.value === 'memberExtensionIds' ? 'No members yet. A queue needs at least one destination.' : `No ${membersEditorLabel.value.toLowerCase()} yet. This feature needs at least one item.`)
function openResourceEditor(resource?: PbxResource) {
  editingResourceId.value = resource?.id ?? null
  Object.keys(editorValues).forEach((key) => delete editorValues[key])
  Object.assign(editorValues, resource?.details ?? {}, { name: resource?.name ?? '', enabled: resource?.enabled ?? true, ringSeconds: resource?.details?.ringSeconds ?? 25, concurrency: resource?.details?.concurrency ?? 4, tls: resource?.details?.tls ?? true })
  queueMembers.value = Array.isArray(resource?.details?.memberExtensionIds)
    ? resource.details.memberExtensionIds.map((value: unknown) => ({ id: crypto.randomUUID(), label: String(value) }))
    : []
  listMembers.value = membersKey.value && membersKey.value !== 'memberExtensionIds' && Array.isArray(resource?.details?.[membersKey.value])
    ? resource.details[membersKey.value].map((value: unknown) => ({ id: crypto.randomUUID(), label: String(value) }))
    : []
  editorOpen.value = true
}
async function saveEditor() {
  if (!isResourcePage(activePage.value)) { recordHistory(`Updated ${page.value.label} local draft`); editorOpen.value = false; return }
  const name = String(editorValues.name || editorValues.number || `${page.value.label} draft`).trim()
  const details: Record<string, unknown> = { ...editorValues }
  if (membersKey.value === 'memberExtensionIds') details.memberExtensionIds = queueMembers.value.map((member) => member.label)
  else if (membersKey.value) details[membersKey.value] = listMembers.value.map((member) => member.label)
  const resource: PbxResource = { id: editingResourceId.value ?? `draft-${crypto.randomUUID()}`, kind: activePage.value, name, summary: page.value.description, enabled: editorValues.enabled !== false, tags: [], updatedAt: new Date().toISOString(), details }
  if (!['connected', 'degraded'].includes(connection.value)) { recordHistory(`Saved ${page.value.label} local draft`); notify('Saved locally only', 'No compatible PBX connection is live. This draft was not sent to a phone system.', 'warning'); editorOpen.value = false; return }
  if (!canAttemptWriteCurrent.value) { notify('Read-only server permission', `A previous request was refused for ${page.value.label}. No change was sent.`, 'warning'); return }
  const result = await client.value.save(resource)
  if (!result.ok) { if (result.state === 'permission-denied') resourceAccess.value[activePage.value] = currentAccess.value === 'read' ? 'read-only' : 'denied'; notify('PBX change was not applied', result.message, result.state === 'permission-denied' ? 'warning' : 'error'); return }
  resourceAccess.value[activePage.value] = 'write'; await loadResources(activePage.value); recordHistory(`Applied ${page.value.label} change through the control service`); notify('PBX change confirmed', result.message, 'success'); editorOpen.value = false
}

async function validateOnboardingTest() {
  if (!onboarding.emergencyConfirmed || !onboarding.testDestination) return notify('More information needed', 'Confirm the emergency-calling policy and enter a normal test destination you control.', 'warning')
  const result = await client.value.validateTestCall(onboarding.testDestination)
  notify(result.ok ? 'Normal test destination validated' : 'Test validation did not pass', result.message, result.ok ? 'success' : 'error')
}
function addMember() {
  const member = { id: crypto.randomUUID(), label: '' }
  if (membersKey.value === 'memberExtensionIds') queueMembers.value.push(member)
  else listMembers.value.push(member)
}
function removeMember(id: string) {
  if (membersKey.value === 'memberExtensionIds') queueMembers.value = queueMembers.value.filter((member) => member.id !== id)
  else listMembers.value = listMembers.value.filter((member) => member.id !== id)
}

watch(activePage, (value) => { if (isResourcePage(value)) void loadResources(value) })

interface Notice { id: number; title: string; body: string; level: 'info' | 'success' | 'warning' | 'error'; at: string }
const notices = ref<Notice[]>([])
let noticeId = 0
function notify(title: string, body: string, level: Notice['level'] = 'info') {
  notices.value.unshift({ id: ++noticeId, title, body, level, at: new Date().toISOString() })
  if (settings.narrator) narrate(`${title}. ${body}`)
}

interface HistoryEntry { id: number; action: string; at: string }
const history = ref<HistoryEntry[]>(JSON.parse(localStorage.getItem('materialpbx.history.v1') ?? '[]'))
function recordHistory(action: string) {
  history.value.unshift({ id: Date.now(), action, at: new Date().toISOString() })
  history.value = history.value.slice(0, 500)
  localStorage.setItem('materialpbx.history.v1', JSON.stringify(history.value))
}

const paletteOpen = ref(false)
const paletteQuery = ref('')
const paletteResults = computed(() => pages.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(paletteQuery.value.toLowerCase())))
function onGlobalKey(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault(); paletteOpen.value = true
  }
}

const voices = ref<SpeechSynthesisVoice[]>([])
function loadVoices() { voices.value = window.speechSynthesis?.getVoices() ?? [] }
function narrate(text: string) {
  if (!('speechSynthesis' in window)) return notify('Narrator unavailable', 'This device does not expose speech synthesis.', 'warning')
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = settings.speechRate; utterance.pitch = settings.speechPitch
  const selected = voices.value.find((voice) => voice.voiceURI === settings.englishVoice)
  if (selected) utterance.voice = selected
  window.speechSynthesis.speak(utterance)
}

const elapsedSeconds = ref(0)
const lastChangedAt = ref(Date.now())
let timer = 0
watch(settings, () => { lastChangedAt.value = Date.now() }, { deep: true })

const accentRepresentations = computed(() => translateColor(settings.accent))
const contrast = computed(() => contrastRatio(settings.accent, settings.theme === 'dark' ? '#1B1B1F' : '#FFFFFF').toFixed(2))
const appearanceDialog = ref(false)
const appearanceTarget = ref('Application')
function editAppearance(target: string) { appearanceTarget.value = target; appearanceDialog.value = true }

const settingsTab = ref('language')
const lockWizardOpen = ref(false)
const lockTarget = ref('Current element')
const ticketDescription = ref('')
const tickets = ref<Array<{ id: string; category: string; description: string; status: string }>>(JSON.parse(localStorage.getItem('materialpbx.tickets.v1') ?? '[]'))
function createTicket() {
  const ticket = { id: `LOCAL-${Date.now().toString(36).toUpperCase()}`, category: 'Locked out', description: ticketDescription.value || 'Open the local storage location for self-service reset.', status: 'Resolution ready' }
  tickets.value.unshift(ticket); localStorage.setItem('materialpbx.tickets.v1', JSON.stringify(tickets.value)); ticketDescription.value = ''; recordHistory(`Created local support ticket ${ticket.id}`)
}
const scheduleRules = ref([{ id: 'work-hours', label: 'Work hours', enabled: false, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '09:00', end: '17:00', source: 'Local settings' }])
function addScheduleRule() { scheduleRules.value.push({ id: crypto.randomUUID(), label: `Schedule ${scheduleRules.value.length + 1}`, enabled: false, days: ['Mon','Tue','Wed','Thu','Fri'], start: '09:00', end: '17:00', source: 'Local settings' }); recordHistory('Added a scheduled settings rule') }
const customLogo = ref<string>('')
function loadLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return notify('Logo rejected', 'Choose a PNG, JPEG, WebP, or SVG under 2 MB.', 'error')
  const reader = new FileReader(); reader.onload = () => { customLogo.value = String(reader.result); recordHistory('Changed application logo') }; reader.readAsDataURL(file)
}

const vocabularyStatus = ref('No personal vocabulary file loaded')
function loadVocabulary(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 256_000) return notify('Vocabulary rejected', 'The local JSON file is limited to 256 KB.', 'error')
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as { version?: number; replacements?: Record<string, unknown> }
      if (parsed.version !== 1 || !parsed.replacements || Object.keys(parsed.replacements).length > 2000 || Object.values(parsed.replacements).some((value) => typeof value !== 'string')) throw new Error('Unsupported schema')
      localStorage.setItem('materialpbx.personal-vocabulary.v1', JSON.stringify(parsed))
      vocabularyStatus.value = `${Object.keys(parsed.replacements).length} local replacements loaded`
      recordHistory('Loaded a personal vocabulary file')
    } catch { notify('Vocabulary rejected', 'The file must use schema version 1 with string replacements only.', 'error') }
  }
  reader.readAsText(file)
}

const dimSum = ref<{ name: string; image?: string } | null>(null)
async function maybeShowDimSum() {
  if (settings.schoolMode || Math.random() >= 0.1) return
  try {
    const response = await fetch('https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json')
    if (!response.ok) return
    const catalog = await response.json() as Array<{ name: { en: string; zhHant: string }; image?: string }>
    const dish = catalog[Math.floor(Math.random() * catalog.length)]
    if (dish) dimSum.value = { name: `${dish.name.en} · ${dish.name.zhHant}`, image: dish.image }
    window.setTimeout(() => { dimSum.value = null }, 7000)
  } catch { /* Delight is optional at runtime and never blocks startup. */ }
}

const superConfirmOpen = ref(false)
const confirmKeys = reactive({ one: false, two: false, slider: 0 })
function completeDestructiveAction() {
  if (!(confirmKeys.one && confirmKeys.two && confirmKeys.slider === 100)) return
  notify('Action authorized', 'The selected local draft was removed. No live PBX was changed.', 'success')
  recordHistory('Deleted a local draft after super confirmation')
  superConfirmOpen.value = false
  Object.assign(confirmKeys, { one: false, two: false, slider: 0 })
}

const exportFormats = ['JSON', 'JSONL', 'YAML', 'TOML', 'XML', 'CSV', 'TSV', 'Markdown', 'HTML', 'SQL', 'TypeScript', 'Python', 'Go', 'Rust', 'JSON Schema', 'Protobuf']
const exportExtensions: Record<string, string> = { JSON: 'json', JSONL: 'ndjson', YAML: 'yaml', TOML: 'toml', XML: 'xml', CSV: 'csv', TSV: 'tsv', Markdown: 'md', HTML: 'html', SQL: 'sql', TypeScript: 'ts', Python: 'py', Go: 'go', Rust: 'rs', 'JSON Schema': 'schema.json', Protobuf: 'proto' }
const exportTypes: Record<string, string> = { JSON: 'application/json', JSONL: 'application/x-ndjson', YAML: 'application/yaml', TOML: 'application/toml', XML: 'application/xml', CSV: 'text/csv', TSV: 'text/tab-separated-values', Markdown: 'text/markdown', HTML: 'text/html', SQL: 'application/sql', TypeScript: 'text/typescript', Python: 'text/x-python', Go: 'text/x-go', Rust: 'text/x-rust', 'JSON Schema': 'application/schema+json', Protobuf: 'text/plain' }
const quoted = (value: unknown) => JSON.stringify(String(value))
function serializeExport(format: string, payload: Record<string, string>) {
  const rows = Object.entries(payload)
  if (format === 'JSON') return JSON.stringify(payload, null, 2)
  if (format === 'JSONL') return rows.map(([key, value]) => JSON.stringify({ key, value })).join('\n')
  if (format === 'YAML') return rows.map(([key, value]) => `${key}: ${quoted(value)}`).join('\n')
  if (format === 'TOML') return rows.map(([key, value]) => `${key} = ${quoted(value)}`).join('\n')
  if (format === 'XML') return `<?xml version="1.0" encoding="UTF-8"?>\n<materialpbxExport>\n${rows.map(([key, value]) => `  <${key}>${value.replace(/[&<>]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[match]!)}</${key}>`).join('\n')}\n</materialpbxExport>`
  if (format === 'CSV' || format === 'TSV') { const separator = format === 'CSV' ? ',' : '\t'; return `key${separator}value\n${rows.map(([key, value]) => `${quoted(key)}${separator}${quoted(value)}`).join('\n')}` }
  if (format === 'Markdown') return `# MaterialPBX export\n\n${rows.map(([key, value]) => `- **${key}:** ${value}`).join('\n')}`
  if (format === 'HTML') return `<!doctype html><meta charset="utf-8"><title>MaterialPBX export</title><h1>MaterialPBX export</h1><dl>${rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('')}</dl>`
  if (format === 'SQL') return `CREATE TABLE materialpbx_export (key TEXT NOT NULL, value TEXT NOT NULL);\n${rows.map(([key, value]) => `INSERT INTO materialpbx_export VALUES (${quoted(key).replaceAll('"', "'")}, ${quoted(value).replaceAll('"', "'")});`).join('\n')}`
  if (format === 'TypeScript') return `export const materialPbxExport = ${JSON.stringify(payload, null, 2)} as const\n`
  if (format === 'Python') return `material_pbx_export = ${JSON.stringify(payload, null, 2).replace(/\bnull\b/g, 'None')}\n`
  if (format === 'Go') return `package materialpbx\n\nvar Export = map[string]string{\n${rows.map(([key, value]) => `\t${quoted(key)}: ${quoted(value)},`).join('\n')}\n}\n`
  if (format === 'Rust') return `pub const MATERIALPBX_EXPORT: &[(&str, &str)] = &[\n${rows.map(([key, value]) => `    (${quoted(key)}, ${quoted(value)}),`).join('\n')}\n];\n`
  if (format === 'JSON Schema') return JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: Object.fromEntries(rows.map(([key]) => [key, { type: 'string' }])), required: rows.map(([key]) => key), additionalProperties: false }, null, 2)
  return `syntax = "proto3";\npackage materialpbx;\nmessage MaterialPbxExport {\n${rows.map(([key], index) => `  string ${key.replace(/[^a-zA-Z0-9_]/g, '_')} = ${index + 1};`).join('\n')}\n}\n`
}
function exportView(format: string) {
  const payload = { exportedAt: new Date().toISOString(), page: page.value.label, connection: connection.value, note: 'Credentials and personal vocabulary are omitted.' }
  const blob = new Blob([serializeExport(format, payload)], { type: `${exportTypes[format] ?? 'text/plain'};charset=utf-8` })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `materialpbx-${activePage.value}.${exportExtensions[format] ?? 'txt'}`; link.click(); URL.revokeObjectURL(link.href)
  notify('Export created', `${format} export downloaded. Credentials and personal vocabulary were omitted.`, 'success')
}

const supportsDesktopVault = computed(() => props.surface === 'desktop')
const desktopWindow = () => (window as unknown as { materialPbxDesktop?: { window?: { minimize(): unknown; maximize(): unknown; close(): unknown } } }).materialPbxDesktop?.window

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
  timer = window.setInterval(() => { elapsedSeconds.value += 1 }, 1000)
  maybeShowDimSum()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
  window.clearInterval(timer)
})
</script>

<template>
  <v-app :theme="settings.theme === 'system' ? undefined : settings.theme" class="materialpbx-app" :class="[{ 'low-stimulation': settings.adhdLowStim, 'rainbow-accent': settings.rainbow }, `density-${settings.density}`]" :style="{ '--pbx-accent': settings.accent, '--pbx-font': settings.fontFamily, '--pbx-scale': settings.fontScale, '--rainbow-speed': `${[24,18,12,8,5][settings.rainbowSpeed-1]}s` }">
    <v-app-bar elevation="0" :class="['top-bar', { 'desktop-title-bar': props.surface === 'desktop' }]" @contextmenu.prevent="editAppearance('Top application bar')">
      <template #prepend>
        <v-avatar color="primary" rounded="lg"><v-img v-if="customLogo" :src="customLogo" alt="Custom MaterialPBX logo"/><span v-else aria-hidden="true">M</span></v-avatar>
      </template>
      <v-app-bar-title>{{ settings.appName }}</v-app-bar-title>
      <v-chip :color="connectionColor" variant="tonal" :prepend-icon="connection === 'connected' ? 'mdi-lan-connect' : connection === 'connecting' ? 'mdi-progress-clock' : 'mdi-lan-disconnect'">{{ connectionLabel }}</v-chip>
      <v-btn icon="mdi-bell-outline" aria-label="Open notifications" @click="openPage('notifications')" />
      <v-btn icon="mdi-magnify" aria-label="Open command palette, Ctrl Shift F" @click="paletteOpen = true" />
      <v-btn icon="mdi-cog-outline" aria-label="Open settings" @click="openPage('settings')" />
      <template v-if="props.surface === 'desktop'">
        <v-btn class="window-control" icon="mdi-window-minimize" aria-label="Minimize window" @click="desktopWindow()?.minimize()" />
        <v-btn class="window-control" icon="mdi-window-maximize" aria-label="Maximize or restore window" @click="desktopWindow()?.maximize()" />
        <v-btn class="window-control close-window" icon="mdi-close" aria-label="Close window" @click="desktopWindow()?.close()" />
      </template>
    </v-app-bar>

    <v-navigation-drawer :location="settings.dock === 'right' ? 'right' : 'left'" :rail="false" width="300" class="nav-drawer" @contextmenu.prevent="editAppearance('Navigation')">
      <div class="search-row pa-3">
        <v-text-field v-model="navSearch.query" label="Find a page" prepend-inner-icon="mdi-magnify" hide-details clearable />
        <v-btn icon="mdi-regex" aria-label="Open regex builder for page search" :color="navSearch.regex ? 'primary' : undefined" @click="navRegexOpen = !navRegexOpen" />
      </div>
      <v-card v-if="navRegexOpen" variant="tonal" class="mx-3 mb-3 pa-3 regex-card">
        <v-switch v-model="navSearch.regex" label="Use regular expression" hide-details />
        <v-text-field v-model="navSearch.flags" label="Flags" hint="Supported: g i m s u y" persistent-hint />
        <p v-if="navCompiled.error" class="text-error" role="alert">{{ navCompiled.error }}</p>
        <div class="builder-chips"><v-chip v-for="token in ['^ start', '$ end', '[abc] class', '(group)', 'a|b either', '+ one or more']" :key="token" size="small" @click="navSearch.query += token.split(' ')[0]">{{ token }}</v-chip></div>
      </v-card>
      <v-list nav density="compact">
        <template v-for="group in [...new Set(filteredPages.map(item => item.group))]" :key="group">
          <v-list-subheader>{{ group }}</v-list-subheader>
          <v-list-item v-for="item in filteredPages.filter(pageItem => pageItem.group === group)" :key="item.id" :active="activePage === item.id" :title="item.label" :subtitle="item.description" @click="openPage(item.id)" @contextmenu.prevent="editAppearance(`${item.label} navigation item`)" />
        </template>
        <v-list-item v-if="!filteredPages.length" title="No matching pages" subtitle="Clear the filter or correct the regular expression." />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <div class="tab-strip" role="tablist" :aria-orientation="settings.dock === 'left' || settings.dock === 'right' ? 'vertical' : 'horizontal'">
        <button v-for="tab in openTabs" :key="tab" role="tab" :aria-selected="activePage === tab" :class="['tab-button', { active: activePage === tab }]" @click="openPage(tab)" @contextmenu.prevent="editAppearance(`${pages.find(item => item.id === tab)?.label} tab`)" @click.middle="closeTab(tab)">
          <span>{{ pages.find(item => item.id === tab)?.label }}</span><span v-if="pinnedTabs.includes(tab)" aria-label="Pinned">●</span><button v-else aria-label="Close tab" @click.stop="closeTab(tab)">×</button>
        </button>
        <v-menu><template #activator="{ props: menuProps }"><v-btn v-bind="menuProps" icon="mdi-dots-horizontal" size="small" aria-label="Tab actions" /></template><v-list><v-list-item title="Search this tab strip…" @click="paletteOpen=true"/><v-list-item title="Search all tabs…" @click="paletteOpen=true"/><v-list-item title="Search groups…" @click="paletteOpen=true"/><v-list-item title="Close tabs containing text…" disabled subtitle="Bulk close is unavailable until its review preview is implemented."/><v-list-item title="Close tabs not containing text…" disabled subtitle="Bulk close is unavailable until its review preview is implemented."/></v-list></v-menu>
      </div>

      <v-container fluid class="content" :class="{ 'focus-mode': settings.adhdFocus }">
        <v-alert v-if="props.surface === 'site'" type="info" variant="tonal" prominent class="mb-4" title="This is the MaterialPBX landing and documentation site">
          This site explains the product, provides documentation, status and settings for this visitor, and links verified downloads when they exist. It is not the primary phone-system application, does not control a PBX, and does not imitate a live PBX in the browser.
        </v-alert>
        <v-alert v-else :type="connectionColor as any" variant="tonal" prominent class="mb-4" :title="connectionLabel">
          {{ connectionMessage }}
          <template #append><div class="d-flex ga-2"><v-btn v-if="!['connected','degraded'].includes(connection)" variant="flat" @click="connectDialog = true">Connect a server</v-btn><v-btn v-else variant="text" @click="disconnectServer">Disconnect</v-btn></div></template>
        </v-alert>

        <v-card v-if="settings.adhdOneThing" class="mb-4 pa-4" color="secondary-container" variant="flat"><v-text-field v-model="settings.nextAction" label="My one current next action" hint="This is chosen by you and stays after a restart." persistent-hint /></v-card>
        <v-card v-if="settings.adhdTime" class="mb-4 pa-3" variant="tonal">Session open: {{ Math.floor(elapsedSeconds/60) }} minutes · Last setting change: {{ Math.floor((Date.now()-lastChangedAt)/60000) }} minutes ago</v-card>

        <template v-if="activePage === 'home'">
          <template v-if="props.surface === 'site'">
            <section class="site-hero" aria-labelledby="site-hero-title">
              <div class="site-hero-copy">
                <p class="eyebrow">A PHONE SYSTEM THAT EXPLAINS ITSELF</p>
                <h1 id="site-hero-title">Calling for everyone, without the wall of forms</h1>
                <p class="site-hero-lead">MaterialPBX turns FreePBX and Asterisk into guided, visual workflows. It explains every term, recommends a safe starting point, and still keeps the expert controls when you need them.</p>
                <div class="site-hero-actions">
                  <v-btn color="primary" size="x-large" prepend-icon="mdi-rocket-launch-outline" @click="openPage('onboarding')">Try the guided walkthrough</v-btn>
                  <v-btn variant="tonal" size="x-large" prepend-icon="mdi-book-open-page-variant-outline" @click="openPage('docs')">Explore every feature</v-btn>
                </div>
                <p class="site-boundary-note"><v-icon icon="mdi-information-outline" aria-hidden="true"/> This public website teaches, documents, and links to verified downloads. The installed or hosted product is what controls a real phone system.</p>
              </div>
              <div class="site-call-map" aria-label="Example visual call path: public number, greeting, team, voicemail">
                <div class="site-call-node emphasized"><v-icon icon="mdi-phone-incoming-outline"/><span><strong>Someone calls</strong><small>Your public number</small></span></div>
                <div class="site-call-connector" aria-hidden="true"></div>
                <div class="site-call-node"><v-icon icon="mdi-message-processing-outline"/><span><strong>Friendly greeting</strong><small>Press 1 for the team</small></span></div>
                <div class="site-call-branches" aria-hidden="true"><span></span><span></span></div>
                <div class="site-call-destinations">
                  <div class="site-call-node"><v-icon icon="mdi-account-group-outline"/><span><strong>Ring the team</strong><small>Three phones together</small></span></div>
                  <div class="site-call-node"><v-icon icon="mdi-voicemail"/><span><strong>Take a message</strong><small>When nobody answers</small></span></div>
                </div>
              </div>
            </section>

            <section class="site-choice-section" aria-labelledby="site-choice-title">
              <p class="eyebrow">CHOOSE YOUR STARTING POINT</p>
              <h2 id="site-choice-title">You do not need to know what a PBX is</h2>
              <p>A PBX is simply the private phone system for a home or organization. It connects people, phones, public numbers, and the rules that decide where a call goes.</p>
              <div class="site-choice-grid">
                <v-card class="site-choice-card pa-6" variant="flat">
                  <v-avatar color="primary-container" size="56"><v-icon icon="mdi-sprout-outline"/></v-avatar>
                  <p class="eyebrow">I AM NEW</p><h3>Show me one safe step at a time</h3>
                  <p>Use plain-language questions, recommended choices, visual call paths, inline explanations, and a review before anything changes.</p>
                  <v-btn color="primary" variant="tonal" @click="openPage('onboarding')">Open the beginner walkthrough</v-btn>
                </v-card>
                <v-card class="site-choice-card pa-6" variant="flat">
                  <v-avatar color="secondary-container" size="56"><v-icon icon="mdi-tune-variant"/></v-avatar>
                  <p class="eyebrow">I KNOW PHONE SYSTEMS</p><h3>Give me the full Asterisk toolbox</h3>
                  <p>Work with extensions, trunks, routes, queues, recordings, calendars, WebRTC, observability, security, paired servers, and advanced resource controls.</p>
                  <v-btn color="secondary" variant="tonal" @click="openPage('docs')">Browse the complete feature map</v-btn>
                </v-card>
                <v-card class="site-choice-card pa-6" variant="flat">
                  <v-avatar color="tertiary-container" size="56"><v-icon icon="mdi-server-network"/></v-avatar>
                  <p class="eyebrow">I NEED THE REAL SERVICE</p><h3>Deploy the production stack</h3>
                  <p>Use the one-click Docker Compose path on a dedicated Linux host. The browser website never pretends to be the telephony runtime.</p>
                  <v-btn color="tertiary" variant="tonal" href="https://github.com/Ding-Ding-Projects/MaterialPBX/blob/main/docs/architecture/deployment.md" target="_blank" rel="noopener">Read the deployment guide</v-btn>
                </v-card>
              </div>
            </section>

            <section class="site-proof-section" aria-labelledby="site-proof-title">
              <div><p class="eyebrow">A GUI THAT BEHAVES LIKE A GUI</p><h2 id="site-proof-title">Pick, slide, connect, preview</h2><p>Enumerated choices use real selectors. Ranges use sliders and steppers. Call destinations use visual cards and flows. Advanced values remain available without making raw configuration text the only route.</p></div>
              <div class="site-control-preview" aria-label="Interactive interface examples">
                <v-select model-value="Ring a group of phones" label="Incoming calls ring" :items="['One person','Ring a group of phones','A phone menu','Voicemail']" hide-details/>
                <v-slider :model-value="20" min="5" max="120" step="5" label="Ring for 20 seconds" thumb-label hide-details/>
                <div class="site-switch-row"><span>Encrypt voice when supported</span><v-switch :model-value="true" color="primary" hide-details aria-label="Encrypt voice when supported"/></div>
                <v-alert type="success" variant="tonal" density="compact">Preview: the team rings for 20 seconds, then voicemail answers.</v-alert>
              </div>
            </section>

            <section class="site-feature-section" aria-labelledby="site-feature-title">
              <div class="site-section-heading"><div><p class="eyebrow">THE WHOLE FEATURE MAP</p><h2 id="site-feature-title">Asterisk depth, organized into understandable destinations</h2></div><v-btn variant="text" append-icon="mdi-arrow-right" @click="openPage('docs')">Open searchable documentation</v-btn></div>
              <div class="site-feature-grid">
                <button v-for="item in pages.filter(item => ['extensions','devices','trunks','inbound-routes','outbound-routes','ivrs','queues','ring-groups','voicemail','time-conditions','paired-servers','observability'].includes(item.id))" :key="item.id" class="site-feature-card" @click="openPage(item.id)">
                  <v-icon :icon="`mdi-${item.icon}`" aria-hidden="true"/><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><v-icon icon="mdi-chevron-right" aria-hidden="true"/>
                </button>
              </div>
            </section>

            <section class="site-download-section" aria-labelledby="site-download-title">
              <div><p class="eyebrow">READY WHEN YOU ARE</p><h2 id="site-download-title">Learn here. Run it where calls belong.</h2><p>Download the latest verified non-draft Windows installer for the desktop lab, or deploy the production phone service on a dedicated Linux host. The Windows installer is intentionally unsigned, so Windows may show an unknown-publisher or SmartScreen warning.</p></div>
              <div class="site-download-actions"><v-btn color="primary" size="large" prepend-icon="mdi-microsoft-windows" href="https://github.com/Ding-Ding-Projects/MaterialPBX/releases/latest/download/MaterialPBX-0.1.0-x64-Setup.exe" target="_blank" rel="noopener">Download MaterialPBX 0.1.0</v-btn><v-btn variant="outlined" size="large" prepend-icon="mdi-github" href="https://github.com/Ding-Ding-Projects/MaterialPBX" target="_blank" rel="noopener">View the public repository</v-btn></div>
            </section>
          </template>
          <template v-else>
            <div class="headline-row"><div><p class="eyebrow">CONTROL CENTER</p><h1>Your phone system, explained</h1><p>MaterialPBX turns FreePBX and Asterisk features into guided, visual workflows. Start with a safe setup or open an expert tool.</p></div><v-btn color="primary" size="large" @click="openPage('onboarding')">Start guided setup</v-btn></div>
            <div class="metric-grid">
              <v-card v-for="metric in [{label:'Active calls',value:healthSnapshot?.activeCalls ?? '—',help:healthSnapshot ? 'Not reported by the system-status endpoint' : 'Requires a live connection'},{label:'Registered phones',value:healthSnapshot?.registeredDevices ?? '—',help:healthSnapshot?.serverName ?? 'Requires a live connection'},{label:'Server warnings',value:healthSnapshot?.warnings.length ?? '—',help:healthSnapshot ? (healthSnapshot.warnings[0] ?? `Checked ${healthSnapshot.checkedAt}`) : 'No live health response'},{label:'Evidence-backed capabilities',value:capabilitySnapshot?.capabilities.length ?? '—',help:capabilitySnapshot ? `Schema ${capabilitySnapshot.schemaVersion} · ${capabilitySnapshot.generatedAt}` : 'Run connection preflight'}]" :key="metric.label" class="pa-5"><p>{{ metric.label }}</p><strong>{{ metric.value }}</strong><small>{{ metric.help }}</small></v-card>
            </div>
            <h2 class="mt-8">Common tasks</h2>
            <div class="task-grid"><v-card v-for="item in pages.filter(item => ['extensions','trunks','inbound-routes','queues','backups','security'].includes(item.id))" :key="item.id" class="pa-5 task-card" tabindex="0" @click="openPage(item.id)" @keydown.enter="openPage(item.id)"><h3>{{ item.label }}</h3><p>{{ item.description }}</p><v-btn variant="text" @click.stop="openPage(item.id)">Open</v-btn></v-card></div>
          </template>
        </template>

        <template v-else-if="activePage === 'onboarding'">
          <p class="eyebrow">ONE-CLICK ONBOARDING</p><h1>Set up calling without PBX experience</h1>
          <p>A PBX is the private phone system for your home or organization. It connects people, phones, public numbers, and rules for where calls go.</p>
          <v-stepper v-model="onboardingStep" alt-labels>
            <v-stepper-header>
              <v-stepper-item v-for="(label,index) in ['Basics','People','Phone company','Call paths','Network safety','Backup & test']" :key="label" :title="label" :value="index+1" />
            </v-stepper-header>
            <v-stepper-window>
              <v-stepper-window-item :value="1"><v-card flat class="step-card"><h2>Name and location</h2><p>The name helps you recognize this server. The timezone decides opening hours, reports, and voicemail dates.</p><v-text-field v-model="onboarding.serverName" label="Phone system name"/><v-select v-model="onboarding.timezone" label="Timezone" :items="[Intl.DateTimeFormat().resolvedOptions().timeZone,'America/Vancouver','America/New_York','Europe/London','Asia/Hong_Kong']"/><v-select v-model="onboarding.country" label="Country or region" :items="[{title:'Canada',value:'CA'},{title:'United States',value:'US'},{title:'Hong Kong',value:'HK'},{title:'United Kingdom',value:'GB'}]"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="2"><v-card flat class="step-card"><h2>People, extensions, and phones</h2><p>An extension is a short internal number such as 101. A device is the desk phone, computer app, or browser that rings for that extension.</p><v-slider v-model="onboarding.extensionDigits" :min="2" :max="6" step="1" label="Extension digits" thumb-label/><v-number-input v-model="onboarding.extensionStart" label="First extension number" :min="10" :max="999999"/><v-select v-model="onboarding.deviceType" label="First phone type" :items="[{title:'Softphone app (easiest to start)',value:'softphone'},{title:'Desk phone',value:'desk'},{title:'Browser calling',value:'browser'}]"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="3"><v-card flat class="step-card"><h2>Connect a phone company</h2><p>A trunk is the connection to a phone company or another PBX. It carries calls to and from public phone numbers.</p><v-select v-model="onboarding.provider" label="Provider plan" :items="['I will connect a phone company later','Generic SIP provider','Pair another FreePBX-compatible server']"/><v-text-field v-model="onboarding.publicNumber" label="Public phone number" hint="Optional. Include country code, such as +14165550100." persistent-hint/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="4"><v-card flat class="step-card"><h2>Choose where calls go</h2><p>An inbound route answers “what rings when someone calls this public number?” An outbound route chooses which trunk carries calls dialed by your phones. Emergency calls need a verified address and provider policy.</p><v-select label="Incoming calls ring" :items="['First extension','A group of phones','A phone menu','Voicemail']"/><v-select label="Outgoing call profile" :items="['Local and long distance','Internal only until verified','Custom expert rules']"/><v-text-field v-model="onboarding.emergencyNumber" label="Emergency number for this region"/><v-checkbox v-model="onboarding.emergencyConfirmed" label="I understand emergency calling must be verified with the phone company and tested using its approved procedure."/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="5"><v-card flat class="step-card"><h2>Network and call encryption</h2><p>NAT lets many devices share one internet address. A firewall limits who can contact the PBX. TLS protects call setup; SRTP protects the voice stream.</p><v-select v-model="onboarding.nat" label="NAT handling" :items="[{title:'Detect automatically (recommended)',value:'automatic'},{title:'No NAT; PBX has a public address',value:'none'},{title:'Expert manual mapping',value:'manual'}]"/><v-select v-model="onboarding.firewall" label="Firewall profile" :items="[{title:'Recommended: trusted networks plus phone company',value:'recommended'},{title:'Local network only',value:'local'},{title:'Expert custom policy',value:'custom'}]"/><v-switch v-model="onboarding.tls" label="Use TLS when supported"/><v-switch v-model="onboarding.srtp" label="Use SRTP when supported"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="6"><v-card flat class="step-card"><h2>Back up, validate, then apply</h2><p>A backup makes recovery possible. The validation step checks registrations and routes before making a test call. Never test emergency calling without using your provider’s approved procedure.</p><v-select v-model="onboarding.backupSchedule" label="Automatic backup schedule" :items="['Every night','Every Sunday','Manual only']"/><v-text-field v-model="onboarding.testDestination" label="Normal test-call number" hint="Use a phone you control. Do not enter an emergency number." persistent-hint/><v-alert type="warning" variant="tonal">This wizard is a local draft while disconnected. “Apply” stays disabled until the server connection, provider credentials, emergency policy, firewall, and backup destination validate successfully.</v-alert></v-card></v-stepper-window-item>
            </v-stepper-window>
            <v-stepper-actions :disabled="onboardingStep === 1 ? 'prev' : onboardingStep === 6 ? 'next' : false" @click:prev="onboardingStep--" @click:next="onboardingStep++" />
          </v-stepper>
          <div class="d-flex justify-end ga-3 mt-4"><v-btn variant="tonal" @click="recordHistory('Saved onboarding draft'); notify('Draft saved','The onboarding draft is stored locally.','success')">Save local draft</v-btn><v-btn color="primary" :disabled="!['connected','degraded'].includes(connection) || !onboarding.emergencyConfirmed || !onboarding.testDestination" @click="validateOnboardingTest">Validate normal test destination</v-btn></div>
        </template>

        <template v-else-if="activePage === 'settings'">
          <p class="eyebrow">SETTINGS</p><h1>Make every surface work your way</h1>
          <div class="settings-search"><v-text-field label="Search settings" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" aria-label="Open regex builder for settings search" @click="openRegexBuilder('Settings search')"/></div>
          <v-tabs v-model="settingsTab" show-arrows><v-tab v-for="tab in ['language','appearance','accessibility','schedules','privacy','advanced']" :key="tab" :value="tab">{{ tab }}</v-tab></v-tabs>
          <v-window v-model="settingsTab" class="settings-window">
            <v-window-item value="language"><section><h2>Language and tone</h2><v-select v-if="!settings.schoolMode" v-model="settings.language" label="Language" :items="[{title:'English',value:'en'},{title:'Playful Hong Kong-style Cantonese',value:'zh-HK'},{title:'Bilingual',value:'bilingual'}]"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyEnglish" min="1" max="5" step="1" thumb-label label="English funny level"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyCantonese" min="1" max="5" step="1" thumb-label label="Cantonese funny level"/><p v-if="!settings.schoolMode">Both funny levels default to 5 and style every message, including warnings and errors. Facts and choices never change.</p><v-switch v-model="settings.dialogEmoji" label="Show emojis in dialogs and message boxes"/><v-divider/><v-switch v-model="settings.schoolMode" :label="settings.schoolName"/><v-text-field v-model="settings.schoolName" label="Name of this mode"/><p>While active, this mode uses English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum capabilities from user-facing surfaces. Turning it off requires the shared local unlock method.</p></section></v-window-item>
            <v-window-item value="appearance"><section><h2>Appearance</h2><v-select v-model="settings.theme" label="Theme" :items="['system','light','dark']"/><v-select v-model="settings.density" label="Density" :items="['comfortable','compact','spacious']"/><div class="color-grid"><v-color-picker v-model="settings.accent" mode="hexa" show-swatches/><div><v-text-field v-model="settings.accent" label="Accent HEX or HEX8"/><v-switch v-model="settings.rainbow" label="Animated rainbow color"/><v-slider v-if="settings.rainbow" v-model="settings.rainbowSpeed" min="1" max="5" step="1" label="Rainbow speed level" thumb-label/><p>Contrast against the current surface: {{ contrast }}:1</p><v-list density="compact"><v-list-item v-for="row in accentRepresentations" :key="row[0]" :title="row[0]" :subtitle="row[1]"/></v-list></div></div><v-text-field v-model="settings.fontFamily" label="Interface font family"/><v-slider v-model="settings.fontScale" min="0.8" max="1.6" step="0.05" label="Font size scale" thumb-label/><v-text-field v-model="settings.appName" label="Displayed application name" hint="This does not change package identity, data folders, installer identity, or update feeds." persistent-hint/><v-select v-model="settings.dock" label="Tab and navigation dock" :items="['left','right','top','bottom']"/><v-btn @click="editAppearance('Settings page')">Edit this page appearance…</v-btn><v-file-input label="Custom application logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="loadLogo"/></section></v-window-item>
            <v-window-item value="accessibility"><section><h2>Accessibility and attention accommodations</h2><v-switch v-model="settings.reducedMotion" label="Reduce motion"/><v-switch v-model="settings.adhdFocus" label="Focus: emphasize the current work"/><v-switch v-model="settings.adhdLowStim" label="Low stimulation: quieter color and motion"/><v-switch v-model="settings.adhdTime" label="Time awareness: show elapsed time"/><v-switch v-model="settings.adhdOneThing" label="One thing at a time: keep one chosen next action"/><v-switch v-model="settings.adhdMomentum" label="Momentum: offer a gentle dismissible prompt after inactivity"/><p>These are interface accommodations, not medical assessment or advice. Every mode is off by default and can be combined.</p><v-divider/><h3>Narrator</h3><v-switch v-model="settings.narrator" label="Narrate important events"/><v-select v-model="settings.narratorLanguage" label="Narrated language" :items="[{title:'English',value:'en'},{title:'Cantonese',value:'zh-HK'},{title:'Both, English then Cantonese',value:'both'}]"/><v-select v-model="settings.englishVoice" label="English voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>v.lang.startsWith('en')).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><v-select v-model="settings.cantoneseVoice" label="Cantonese voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>/zh.*(HK|Hant)/i.test(v.lang)).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><v-slider v-model="settings.speechRate" min="0.5" max="2" step="0.1" label="Speech rate"/><v-slider v-model="settings.speechPitch" min="0" max="2" step="0.1" label="Speech pitch"/><v-btn @click="narrate('MaterialPBX narrator preview. Your selected voice is ready.')">Preview voice</v-btn></section></v-window-item>
            <v-window-item value="schedules"><section><h2>Scheduled settings</h2><p>Rules use your local timezone. Cross-midnight rules continue into the next day. Later rules win when two enabled rules overlap.</p><v-card v-for="rule in scheduleRules" :key="rule.id" class="pa-4 mb-3"><v-switch v-model="rule.enabled" :label="rule.label"/><div class="schedule-grid"><v-select v-model="rule.days" label="Days" multiple chips :items="['Mon','Tue','Wed','Thu','Fri','Sat','Sun']"/><v-text-field v-model="rule.start" type="time" label="Start time"/><v-text-field v-model="rule.end" type="time" label="End time"/><v-select v-model="rule.source" label="Source" :items="['Local settings','Validated HTTPS API','Home Assistant boolean entity']"/></div></v-card><v-btn prepend-icon="mdi-plus" @click="addScheduleRule">Add rule</v-btn></section></v-window-item>
            <v-window-item value="privacy"><section><h2>Local privacy</h2><v-file-input v-if="!settings.schoolMode" label="Personal vocabulary JSON" accept="application/json" @change="loadVocabulary"/><p v-if="!settings.schoolMode">{{ vocabularyStatus }}</p><v-btn v-if="!settings.schoolMode" variant="tonal" @click="localStorage.removeItem('materialpbx.personal-vocabulary.v1'); vocabularyStatus='No personal vocabulary file loaded'">Clear personal vocabulary</v-btn><p>Personal vocabulary parsing and caching stay on this device and are excluded from exports, logs, analytics, crash reports, history, and synchronization.</p><v-divider/><h3>Local history</h3><p>Settings and user-managed records are appended to local history. Credentials and authenticator secrets are never stored as plaintext history.</p><v-btn @click="openPage('history')">Open history</v-btn></section></v-window-item>
            <v-window-item value="advanced"><section><h2>Advanced controls</h2><v-switch v-model="expertMode" label="Show expert PBX controls"/><p>Expert controls expose direct Asterisk concepts with explanations and safe defaults. Raw configuration is never the only path.</p><v-select label="External editor" :items="['Visual Studio Code (auto-detect)','Visual Studio Code Insiders','Choose an executable…']"/><v-btn disabled title="External-editor process launch is not connected in this build.">Open current export in Visual Studio Code</v-btn><v-divider/><h3>Universal exclusions for this project</h3><p>The local Ollama suite manager and universal file converter are intentionally not included, by explicit project direction.</p></section></v-window-item>
          </v-window>
        </template>

        <template v-else-if="activePage === 'notifications'">
          <p class="eyebrow">NOTIFICATION CENTER</p><h1>Messages and recovery actions</h1><div class="toolbar"><v-btn @click="notices=[]">Dismiss all</v-btn><v-menu><template #activator="{props:menuProps}"><v-btn v-bind="menuProps">Bulk export</v-btn></template><v-list><v-list-item v-for="format in exportFormats" :key="format" :title="format" @click="exportView(format)"/></v-list></v-menu></div><v-card v-for="notice in notices" :key="notice.id" class="pa-4 mb-3"><h3>{{ notice.title }}</h3><p>{{ notice.body }}</p><small>{{ notice.at }}</small></v-card><v-card v-if="!notices.length" class="pa-8 text-center">No notifications yet.</v-card>
        </template>

        <template v-else-if="activePage === 'history'">
          <p class="eyebrow">LOCAL HISTORY</p><h1>Review changes without rewriting the past</h1><div class="toolbar"><v-text-field type="date" label="From date"/><v-select label="Action" multiple :items="[...new Set(history.map(item=>item.action))]"/><v-text-field label="Search history"/><v-btn icon="mdi-regex" aria-label="Open regex builder for history search" @click="openRegexBuilder('History search')"/></div><v-timeline side="end"><v-timeline-item v-for="entry in history" :key="entry.id" dot-color="primary"><strong>{{ entry.action }}</strong><p>{{ entry.at }}</p><v-btn variant="text" disabled title="This entry records an action but does not contain a restorable snapshot.">Restore as a new revision</v-btn></v-timeline-item></v-timeline><v-card v-if="!history.length" class="pa-8 text-center">No local revisions yet.</v-card>
        </template>

        <template v-else-if="activePage === 'authenticator'">
          <p class="eyebrow">LOCAL AUTHENTICATOR</p><h1>Time-based codes without cloud sync</h1><v-alert :type="supportsDesktopVault ? 'info':'warning'" variant="tonal">{{ supportsDesktopVault ? 'The credential-vault registration adapter is not connected in this build, so account creation stays disabled.' : 'This browser surface cannot use the operating-system credential vault. Add and reveal codes only after the desktop adapter is implemented.' }}</v-alert><div class="toolbar"><v-text-field label="Search issuer or account"/><v-btn icon="mdi-regex" aria-label="Open regex builder for authenticator search" @click="openRegexBuilder('Authenticator search')"/><v-btn color="primary" disabled title="Credential-vault registration is not connected in this build.">Add account</v-btn></div><v-card class="pa-8 text-center">No authenticator accounts registered.</v-card>
        </template>

        <template v-else-if="activePage === 'locks'">
          <p class="eyebrow">OPTIONAL LOCAL SPEED BUMPS</p><h1>Toy locks for individual elements</h1><v-alert type="warning" variant="tonal">These locks are for fun and organization. They do not encrypt data, secure the PBX, or protect anything from another person using this computer.</v-alert><div class="toolbar"><v-text-field label="Search locked elements"/><v-btn icon="mdi-regex" aria-label="Open regex builder for lock search" @click="openRegexBuilder('Toy-lock search')"/><v-btn color="primary" @click="lockTarget='Current page';lockWizardOpen=true">Lock an element…</v-btn></div><v-card class="pa-8 text-center"><h2>No toy locks configured</h2><p>Every lock has its own password or time-based code and its own duration. Clearing this visitor’s site storage or the desktop application-data folder resets all locks.</p><v-btn variant="tonal" @click="openPage('support')">Forgotten a lock? Open Support Tickets</v-btn></v-card>
        </template>

        <template v-else-if="activePage === 'support'">
          <p class="eyebrow">FICTIONAL LOCAL SUPPORT DESK</p><h1>Support Tickets</h1><v-alert type="info" variant="tonal">Nothing is sent anywhere. No ticket exists outside this device, no network request is made, no data is collected, and nobody is reading it.</v-alert><div class="toolbar"><v-select label="Category" model-value="Locked out" :items="['Locked out','Cannot find a setting','Something else']"/><v-text-field v-model="ticketDescription" label="Description"/><v-btn color="primary" @click="createTicket">Create local ticket</v-btn></div><v-card v-for="ticket in tickets" :key="ticket.id" class="pa-5 mb-3"><div class="d-flex justify-space-between"><strong>{{ ticket.id }}</strong><v-chip>{{ ticket.status }}</v-chip></div><p>{{ ticket.category }} · {{ ticket.description }}</p><p>Resolution: clear this visitor’s browser storage, or open the MaterialPBX application-data folder from the desktop app and delete it yourself. This interface never deletes it for you.</p></v-card><v-card v-if="!tickets.length" class="pa-8 text-center">No local tickets yet.</v-card>
        </template>

        <template v-else-if="activePage === 'changelog'">
          <p class="eyebrow">RELEASE HISTORY</p><h1>Changelog</h1><div class="toolbar"><v-text-field type="date" label="From date"/><v-text-field type="date" label="To date"/><v-text-field label="Search changes"/><v-btn icon="mdi-regex" aria-label="Open regex builder for changelog search" @click="openRegexBuilder('Changelog search')"/><v-btn @click="exportView('Markdown')">Export filtered view</v-btn></div><v-card class="pa-6"><div class="d-flex justify-space-between"><h2>0.1.0</h2><time datetime="2026-08-22">2026-08-22</time></div><h3>Added</h3><ul><li>Guided MaterialPBX web interface and Windows desktop lab.</li><li>Plain-language one-click onboarding and visual PBX feature destinations.</li><li>Landing and documentation surface with an explicit non-runtime boundary.</li></ul><p><a href="https://github.com/Ding-Ding-Projects/MaterialPBX/commit/5147a896f8c65b863607378480d5fe46df04e31f" target="_blank" rel="noopener">Source commit 5147a89</a></p></v-card>
        </template>

        <template v-else-if="activePage === 'docs'">
          <p class="eyebrow">OFFLINE GUIDE</p><h1>Every feature, explained in plain language</h1><div class="toolbar"><v-text-field label="Search titles and article text"/><v-btn icon="mdi-regex" aria-label="Open regex builder for documentation search" @click="openRegexBuilder('Documentation search')"/></div><div class="task-grid"><v-card v-for="item in pages.filter(item=>!['docs','settings'].includes(item.id))" :key="item.id" class="pa-5 task-card"><h3>{{ item.label }}</h3><p>{{ item.description }}</p><v-btn variant="text" @click="openPage(item.id)">Open feature</v-btn></v-card></div>
        </template>

        <template v-else-if="visualFeature">
          <section class="feature-hero">
            <div class="feature-symbol" aria-hidden="true">{{ visualFeature.icon }}</div>
            <div><p class="eyebrow">{{ visualFeature.eyebrow }}</p><h1>{{ page.label }}</h1><p class="feature-lead">{{ visualFeature.lead }}</p><p class="safe-default"><strong>Safe starting point:</strong> {{ visualFeature.default }}</p></div>
            <div v-if="props.surface === 'site'" class="feature-actions"><v-btn variant="tonal" prepend-icon="mdi-book-open-page-variant-outline" @click="openPage('docs')">Browse all guides</v-btn><v-btn color="primary" prepend-icon="mdi-download-outline" href="https://github.com/Ding-Ding-Projects/MaterialPBX/releases/latest/download/MaterialPBX-0.1.0-x64-Setup.exe" target="_blank" rel="noopener">Get the real app</v-btn></div>
            <div v-else class="feature-actions"><v-btn variant="tonal" :loading="resourceLoading" :disabled="!['connected','degraded'].includes(connection)" @click="loadResources(activePage as PbxResourceKind)">Refresh live data</v-btn><v-btn color="primary" :disabled="!canAttemptWriteCurrent" :title="!canAttemptWriteCurrent ? 'A prior write request was refused for this feature.' : 'Write permission is confirmed only after the server accepts a save.'" @click="openResourceEditor()">{{ activePage === 'observability' ? 'Configure view' : 'Create' }}</v-btn></div>
          </section>
          <div v-if="props.surface === 'site'" class="feature-metrics">
            <v-card class="pa-5"><span>What this page does</span><strong>Explains</strong><small>Definitions, the safe starting point, and how this capability fits into a call path.</small></v-card>
            <v-card class="pa-5"><span>What this page never does</span><strong>No live changes</strong><small>The public website never connects to, reads from, or writes to a PBX.</small></v-card>
            <v-card class="pa-5"><span>Where real controls run</span><strong>Installed or hosted</strong><small>Use the verified app or the dedicated production deployment.</small></v-card>
          </div>
          <div v-else class="feature-metrics">
            <v-card class="pa-5"><span>Live records</span><strong>{{ ['connected','degraded'].includes(connection) ? currentResources.length : '—' }}</strong><small>{{ ['connected','degraded'].includes(connection) ? currentAccess === 'denied' ? 'Resource request was refused' : 'Returned by this server' : 'Connect to load real records' }}</small></v-card>
            <v-card class="pa-5"><span>Observed access</span><strong>{{ currentAccess === 'write' ? 'Write confirmed' : currentAccess === 'read-only' ? 'Read only' : currentAccess === 'denied' ? 'Refused' : currentAccess === 'read' ? 'Read confirmed' : 'Not checked' }}</strong><small>The capability registry is evidence, not authorization. Access changes only after a real resource response.</small></v-card>
            <v-card class="pa-5"><span>PBX health</span><strong>{{ connectionLabel }}</strong><small>{{ healthSnapshot?.warnings[0] ?? connectionMessage }}</small></v-card>
          </div>
          <section v-if="activePage === 'ivrs'" class="call-flow-canvas" aria-label="Phone menu call-flow canvas">
            <article class="flow-node start"><span>1</span><div><strong>Greeting</strong><small>Play one verified recording</small></div></article><div class="flow-line">Callers choose</div>
            <div class="flow-branches"><article v-for="branch in [{key:'0',label:'Operator'},{key:'1',label:'Sales queue'},{key:'2',label:'Support queue'},{key:'…',label:'Invalid or timeout'}]" :key="branch.key" class="flow-node"><span>{{ branch.key }}</span><div><strong>{{ branch.label }}</strong><small>Choose a verified destination in the editor</small></div></article></div>
          </section>
          <div class="control-room-grid" :aria-busy="resourceLoading">
            <v-card v-for="resource in currentResources" :key="resource.id" class="resource-card pa-5"><div class="resource-card-title"><div><h2>{{ resource.name }}</h2><p>{{ resource.summary || page.description }}</p></div><v-switch :model-value="resource.enabled" hide-details :label="`${resource.name} enabled`" :disabled="!canAttemptWriteCurrent" @update:model-value="openResourceEditor(resource)"/></div><div class="resource-tags"><v-chip v-for="tag in resource.tags" :key="tag" size="small">{{ tag }}</v-chip><v-chip size="small" variant="outlined">Updated {{ resource.updatedAt || 'time not reported' }}</v-chip></div><v-btn variant="text" :disabled="!canAttemptWriteCurrent" @click="openResourceEditor(resource)">Open visual editor</v-btn></v-card>
            <v-card v-if="!currentResources.length" class="feature-empty pa-8"><div class="empty-icon">{{ visualFeature.icon }}</div><h2>{{ props.surface === 'site' ? 'Understand the feature before configuring it' : currentAccess === 'denied' ? 'Resource permission refused' : ['connected','degraded'].includes(connection) ? 'No records returned for this feature' : 'Connect to load real PBX records' }}</h2><p>{{ props.surface === 'site' ? 'This guide explains what the installed and hosted controls do, what a safe starting point looks like, and which related feature to learn next. It never shows fake live records.' : currentAccess === 'denied' ? 'The authenticated resource request returned a permission refusal. Ask an administrator for the narrow resource permission and retry.' : ['connected','degraded'].includes(connection) ? 'The control service returned an empty list. MaterialPBX does not insert sample live data.' : 'You can review the guided controls and save a local draft. Nothing will be presented as live until preflight succeeds.' }}</p><v-btn v-if="props.surface !== 'site' && !['connected','degraded'].includes(connection)" color="primary" @click="connectDialog=true">Connect a server</v-btn><v-btn v-else-if="props.surface !== 'site' && canAttemptWriteCurrent" color="primary" @click="openResourceEditor()">Create the first item</v-btn><v-btn v-else-if="props.surface === 'site'" variant="tonal" @click="openPage('docs')">Find related guides</v-btn></v-card>
          </div>
        </template>

        <template v-else>
          <div class="headline-row"><div><p class="eyebrow">{{ page.group.toUpperCase() }}</p><h1>{{ page.label }}</h1><p>{{ page.description }}</p></div><div class="d-flex ga-2"><v-btn variant="tonal" @click="expertMode=!expertMode">{{ expertMode ? 'Guided view' : 'Expert view' }}</v-btn><v-btn v-if="props.surface !== 'site'" color="primary" prepend-icon="mdi-plus" @click="openResourceEditor()">Create</v-btn></div></div>
          <v-alert v-if="expertMode" type="info" variant="tonal" class="mb-4">Expert view names the Asterisk and FreePBX concepts behind each control. Values still use typed pickers, switches, ranges, and validated fields instead of raw configuration text.</v-alert>
          <div class="toolbar"><v-text-field :label="`Search ${page.label}`" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" :aria-label="`Open regex builder for ${page.label} search`" @click="openRegexBuilder(`${page.label} search`)"/><v-select label="Status" :items="['All','Enabled','Disabled','Needs attention']"/><v-btn @click="exportView('JSON')">Export</v-btn><v-btn color="error" variant="tonal" @click="superConfirmOpen=true">Delete selected…</v-btn></div>
          <v-card class="empty-state pa-10 text-center"><div class="empty-icon">{{ page.icon }}</div><h2>{{ props.surface === 'site' ? 'Product feature guide' : `No ${page.label.toLowerCase()} loaded` }}</h2><p>{{ props.surface === 'site' ? 'This documentation surface explains the control without presenting sample live PBX records.' : ['connected','degraded'].includes(connection) ? 'The server returned no records or did not grant read permission. MaterialPBX never inserts fake live data.' : 'Connect a PBX to load real records, or create a local draft now. Nothing will be applied while offline.' }}</p><v-btn v-if="props.surface !== 'site'" color="primary" @click="openResourceEditor()">Create local draft</v-btn></v-card>
        </template>
      </v-container>
    </v-main>

    <v-dialog v-model="connectDialog" max-width="720"><v-card><v-card-title>Connect a PBX control service</v-card-title><v-card-text><p>Enter the HTTPS address and an admin credential for this session. Only the successful non-secret endpoint is saved locally. The credential stays in memory, is removed from this form immediately, and is discarded on disconnect or reload.</p><v-text-field v-model="serverUrl" label="Control-service address" type="url" placeholder="https://pbx.example.com" hint="Use HTTPS. HTTP is accepted only for localhost development." persistent-hint/><v-text-field v-model="serverCredential" label="Admin credential for this session" type="password" autocomplete="off" hint="Sent as an Authorization bearer credential. Never stored in settings, logs, history, or exports." persistent-hint/><v-alert :type="connection === 'permission-denied' ? 'warning' : ['offline','incompatible'].includes(connection) ? 'error' : 'info'" variant="tonal"><strong>{{ connectionLabel }}</strong><p>{{ connectionMessage }}</p></v-alert><div class="preflight-list"><div><v-icon icon="mdi-shield-check-outline"/><span>Public health at <code>/healthz</code></span></div><div><v-icon icon="mdi-api"/><span>Evidence registry schema and warnings</span></div><div><v-icon icon="mdi-account-key-outline"/><span>Authenticated system status</span></div><div><v-icon icon="mdi-phone-check-outline"/><span>Runtime-probed adapters and identity</span></div></div><p v-if="connection === 'permission-denied'">Recovery: enter a permitted admin credential and run preflight again. The capability registry describes evidence; it does not grant authorization.</p><p v-else-if="connection === 'offline'">Recovery: verify the address, trusted certificate, service process, firewall, and network route, then retry.</p><p v-else-if="connection === 'incompatible'">Recovery: correct the endpoint or update the MaterialPBX control service to a compatible API version.</p></v-card-text><v-card-actions><v-btn variant="text" :disabled="!serverUrl" @click="clearSavedEndpoint">Clear saved endpoint</v-btn><v-spacer/><v-btn @click="connectDialog=false;serverCredential=''">Cancel</v-btn><v-btn color="primary" :loading="connection === 'connecting'" :disabled="!serverUrl.trim() || !serverCredential" @click="runPreflight">Run real preflight</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="editorOpen" max-width="760"><v-card><v-card-title>{{ editingResourceId ? 'Edit' : 'Create' }} {{ page.label }}</v-card-title><v-card-subtitle>{{ page.description }}</v-card-subtitle><v-card-text><template v-for="field in currentForm" :key="field.key"><v-text-field v-if="field.type==='text'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/><v-number-input v-else-if="field.type==='number'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/><v-select v-else-if="field.type==='select'" v-model="editorValues[field.key]" :label="field.label" :items="field.options" :hint="field.help" persistent-hint/><v-slider v-else-if="field.type==='slider'" v-model="editorValues[field.key]" :label="field.label" :min="1" :max="field.key==='ringSeconds'?120:64" thumb-label/><v-switch v-else-if="field.type==='switch'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/></template><section v-if="currentForm.some((field) => field.type === 'members')" class="member-editor" :aria-label="membersEditorLabel"><h2>{{ membersEditorLabel }}</h2><v-list density="compact"><v-list-item v-for="member in activeMembers" :key="member.id"><v-text-field v-model="member.label" :label="membersFieldLabel" hint="Use the exact validated identifier described by this field." persistent-hint /><template #append><v-btn icon="mdi-delete-outline" variant="text" aria-label="Remove item" @click="removeMember(member.id)" /></template></v-list-item></v-list><p v-if="!activeMembers.length">{{ membersEmptyMessage }}</p><v-btn prepend-icon="mdi-plus" @click="addMember">Add item</v-btn></section><v-alert v-if="['connected','degraded'].includes(connection)" type="info" variant="tonal">Saving sends this typed resource to the authenticated control service. Success appears only after the server confirms it.</v-alert><v-alert v-else type="warning" variant="tonal">Saving creates a local draft only. No PBX is connected.</v-alert></v-card-text><v-card-actions><v-spacer/><v-btn @click="editorOpen=false">Cancel</v-btn><v-btn color="primary" :disabled="['connected','degraded'].includes(connection) && !canAttemptWriteCurrent" @click="saveEditor">{{ ['connected','degraded'].includes(connection) ? 'Apply through control service' : 'Save local draft' }}</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="paletteOpen" :fullscreen="false" max-width="860"><v-card class="palette"><v-card-title>Command palette</v-card-title><v-card-text><div class="search-row"><v-text-field v-model="paletteQuery" autofocus label="Search every page, command, setting, and appearance control" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" aria-label="Open regex builder for command palette search" @click="openRegexBuilder('Command-palette search')"/></div><v-list><v-list-item v-for="item in paletteResults" :key="item.id" :title="item.label" :subtitle="`${item.group} · ${item.description}`" @click="openPage(item.id);paletteOpen=false"/><v-list-item title="Theme"><template #append><v-select v-model="settings.theme" hide-details density="compact" :items="['system','light','dark']"/></template></v-list-item><v-list-item title="Narrator"><template #append><v-switch v-model="settings.narrator" hide-details/></template></v-list-item></v-list></v-card-text></v-card></v-dialog>

    <v-dialog v-model="regexDialogOpen" max-width="760"><v-card><v-card-title>Regular-expression builder · {{ regexContext }}</v-card-title><v-card-text><v-switch v-model="regexDraft.regex" label="Use regular expression"/><v-text-field v-model="regexDraft.query" label="Pattern or plain text"/><v-text-field v-model="regexDraft.flags" label="Flags" hint="Supported JavaScript flags: d g i m s u v y" persistent-hint/><div class="builder-chips"><v-chip v-for="token in ['^','$','[abc]','(group)','a|b','+','*','?']" :key="token" @click="regexDraft.query += token">{{ token }}</v-chip></div><v-alert v-if="regexDraftResult.error" type="error" variant="tonal">{{ regexDraftResult.error }}</v-alert><v-alert v-else type="success" variant="tonal">Pattern is valid for the JavaScript regular-expression engine.</v-alert></v-card-text><v-card-actions><v-spacer/><v-btn @click="regexDialogOpen=false">Close</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="appearanceDialog" max-width="860"><v-card><v-card-title>Edit appearance: {{ appearanceTarget }}</v-card-title><v-card-text><p>This anchored editor changes the selected element only. Unsupported properties remain visible with an explanation.</p><v-tabs><v-tab>Typography</v-tab><v-tab>Color</v-tab><v-tab>Shape</v-tab><v-tab>States</v-tab></v-tabs><div class="appearance-grid"><v-text-field label="Font family" :model-value="settings.fontFamily"/><v-number-input label="Font size" :model-value="16"/><v-select label="Weight" :items="[100,200,300,400,500,600,700,800,900]"/><v-checkbox label="Italic"/><v-select label="Underline" :items="['None','Single','Double','Dotted','Wavy']"/><v-select label="Strikethrough" :items="['None','Single','Double']"/><v-number-input label="Letter spacing" suffix="px"/><v-number-input label="Line height"/><v-number-input label="Corner radius" suffix="px"/><v-select label="Elevation" :items="[0,1,2,3,4,5]"/></div><v-btn color="primary" @click="appearanceDialog=false;recordHistory(`Changed appearance of ${appearanceTarget}`)">Apply to this element</v-btn></v-card-text></v-card></v-dialog>

    <v-dialog v-model="lockWizardOpen" max-width="680"><v-card><v-card-title>Lock this element: {{ lockTarget }}</v-card-title><v-card-text><v-alert type="warning" variant="tonal">This is a toy lock, not security or encryption. Clearing local site storage or the application-data folder resets it.</v-alert><v-select label="Unlock method" :items="['Password stored as a local verifier','Time-based code from your authenticator']"/><v-select label="Unlock duration" :items="['This surface only','5 minutes','30 minutes','Until the app closes']"/><v-text-field type="password" label="Create this lock’s credential" autocomplete="new-password"/><p>Each element receives its own credential. Nothing is sent to a server or included in exports and history.</p></v-card-text><v-card-actions><v-btn @click="lockWizardOpen=false">Cancel</v-btn><v-spacer/><v-btn color="primary" @click="lockWizardOpen=false;recordHistory(`Created a toy lock for ${lockTarget}`)">Create toy lock</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="superConfirmOpen" max-width="680" persistent><v-card><v-card-title>Confirm destructive action</v-card-title><v-card-text><p>This removes the selected local draft. It cannot affect a live PBX while disconnected.</p><div class="key-grid"><v-checkbox v-model="confirmKeys.one" label="Key 1: I selected the intended item"/><v-checkbox v-model="confirmKeys.two" label="Key 2: I reviewed what will be removed"/></div><v-slider v-model="confirmKeys.slider" :disabled="!(confirmKeys.one&&confirmKeys.two)" min="0" max="100" step="1" label="Slide fully to authorize" thumb-label/></v-card-text><v-card-actions><v-btn @click="superConfirmOpen=false">Emergency exit</v-btn><v-spacer/><v-btn color="error" :disabled="!(confirmKeys.one&&confirmKeys.two&&confirmKeys.slider===100)" @click="completeDestructiveAction">Complete removal</v-btn></v-card-actions></v-card></v-dialog>

    <v-snackbar v-if="dimSum" :model-value="true" location="bottom right" timeout="7000"><strong>{{ dimSum.name }}</strong><p>A small startup surprise from the public dim-sum catalog.</p></v-snackbar>
    <div class="snackbar-stack" aria-live="polite"><v-alert v-for="notice in notices.slice(0,3)" :key="notice.id" :type="notice.level" closable variant="elevated" @click:close="notices=notices.filter(item=>item.id!==notice.id)"><strong>{{ notice.title }}</strong><div>{{ notice.body }}</div></v-alert></div>
  </v-app>
</template>
