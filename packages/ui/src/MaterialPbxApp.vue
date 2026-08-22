<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createDisconnectedClient, type PbxResourceKind } from '@materialpbx/client'
import { contrastRatio, RAINBOW_SENTINEL, translateColor } from './color'
import { compileSearch } from './regex'

const props = withDefaults(defineProps<{ surface?: 'web' | 'desktop' | 'site' }>(), { surface: 'web' })
const client = createDisconnectedClient()

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

const connection = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
const serverUrl = ref('https://pbx.example.local')
const connectDialog = ref(false)
const expertMode = ref(false)

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
    { key: 'provider', label: 'Phone company profile', type: 'select', options: ['Generic SIP', 'Pair another PBX', 'Custom verified profile'], help: 'A guided profile supplies safe defaults.' },
    { key: 'transport', label: 'Call transport', type: 'select', options: ['TLS (recommended)', 'TCP', 'UDP'], help: 'TLS encrypts signaling when the provider supports it.' },
    { key: 'media', label: 'Voice encryption', type: 'select', options: ['SRTP (recommended)', 'Provider default', 'RTP'], help: 'SRTP encrypts the voice stream when both sides support it.' },
    { key: 'concurrency', label: 'Maximum simultaneous calls', type: 'slider', help: 'Prevents this connection from accepting more calls than purchased.' },
  ],
}

const genericForm = [
  { key: 'name', label: 'Name', type: 'text', help: 'A clear label shown throughout MaterialPBX.' },
  { key: 'enabled', label: 'Enabled', type: 'switch', help: 'Turn this item on without deleting its settings.' },
  { key: 'destination', label: 'Next destination', type: 'select', options: ['Extension', 'Queue', 'Voicemail', 'Announcement', 'Hang up'], help: 'What should happen after this step.' },
]
const editorOpen = ref(false)
const editorValues = reactive<Record<string, string | number | boolean>>({ name: '', enabled: true, ringSeconds: 25, concurrency: 4 })
const currentForm = computed(() => resourceForms[activePage.value] ?? genericForm)
function saveEditor() {
  if (connection.value !== 'connected') {
    notify('Saved locally only', 'No PBX is connected. This draft was not applied to a live phone system.', 'warning')
  }
  recordHistory(`Updated ${page.value.label} draft`)
  editorOpen.value = false
}

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
      <v-chip color="warning" variant="tonal" prepend-icon="mdi-lan-disconnect">Disconnected</v-chip>
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
        <v-menu><template #activator="{ props: menuProps }"><v-btn v-bind="menuProps" icon="mdi-dots-horizontal" size="small" aria-label="Tab actions" /></template><v-list><v-list-item title="Search this tab strip…"/><v-list-item title="Search all tabs…"/><v-list-item title="Search groups…"/><v-list-item title="Close tabs containing text…"/><v-list-item title="Close tabs not containing text…"/></v-list></v-menu>
      </div>

      <v-container fluid class="content" :class="{ 'focus-mode': settings.adhdFocus }">
        <v-alert v-if="props.surface === 'site'" type="info" variant="tonal" prominent class="mb-4" title="This is the MaterialPBX landing and documentation site">
          This site explains the product, provides documentation, status and settings for this visitor, and links verified downloads when they exist. It is not the primary phone-system application, does not control a PBX, and does not imitate a live PBX in the browser.
        </v-alert>
        <v-alert type="warning" variant="tonal" prominent class="mb-4" title="No PBX is connected">
          You can explore every control and save local drafts. Nothing shown here is live PBX data, and no change will be applied until a server connection succeeds.
          <template #append><v-btn variant="flat" @click="connectDialog = true">Connect a server</v-btn></template>
        </v-alert>

        <v-card v-if="settings.adhdOneThing" class="mb-4 pa-4" color="secondary-container" variant="flat"><v-text-field v-model="settings.nextAction" label="My one current next action" hint="This is chosen by you and stays after a restart." persistent-hint /></v-card>
        <v-card v-if="settings.adhdTime" class="mb-4 pa-3" variant="tonal">Session open: {{ Math.floor(elapsedSeconds/60) }} minutes · Last setting change: {{ Math.floor((Date.now()-lastChangedAt)/60000) }} minutes ago</v-card>

        <template v-if="activePage === 'home'">
          <div class="headline-row"><div><p class="eyebrow">CONTROL CENTER</p><h1>Your phone system, explained</h1><p>MaterialPBX turns FreePBX and Asterisk features into guided, visual workflows. Start with a safe setup or open an expert tool.</p></div><v-btn color="primary" size="large" @click="openPage('onboarding')">Start guided setup</v-btn></div>
          <div class="metric-grid">
            <v-card v-for="metric in [{label:'Active calls',value:'—',help:'Requires a live connection'},{label:'Registered phones',value:'—',help:'Requires a live connection'},{label:'Security notices',value:'1',help:'Disconnected state'},{label:'Last verified backup',value:'Never',help:'Connect a server to check'}]" :key="metric.label" class="pa-5"><p>{{ metric.label }}</p><strong>{{ metric.value }}</strong><small>{{ metric.help }}</small></v-card>
          </div>
          <h2 class="mt-8">Common tasks</h2>
          <div class="task-grid"><v-card v-for="item in pages.filter(item => ['extensions','trunks','inbound-routes','queues','backups','security'].includes(item.id))" :key="item.id" class="pa-5 task-card" tabindex="0" @click="openPage(item.id)" @keydown.enter="openPage(item.id)"><h3>{{ item.label }}</h3><p>{{ item.description }}</p><v-btn variant="text">Open</v-btn></v-card></div>
          <v-card v-if="props.surface === 'site'" class="mt-8 pa-6" variant="tonal"><h2>Downloads</h2><p>No verified installer has been published yet. A download button will appear here only after a release asset is built, published, and verified. This page never links a guessed or candidate installer.</p><v-btn disabled title="No verified release asset exists">Windows installer unavailable</v-btn><p class="mt-4">For production hosting, the one-click deployment guide uses the repository’s Docker Compose files and keeps telephony services on the dedicated Linux host. The guide link activates when those deployment artifacts land on the default branch.</p></v-card>
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
          <div class="d-flex justify-end ga-3 mt-4"><v-btn variant="tonal" @click="recordHistory('Saved onboarding draft'); notify('Draft saved','The onboarding draft is stored locally.','success')">Save local draft</v-btn><v-btn color="primary" :disabled="connection !== 'connected' || !onboarding.emergencyConfirmed">Validate and apply</v-btn></div>
        </template>

        <template v-else-if="activePage === 'settings'">
          <p class="eyebrow">SETTINGS</p><h1>Make every surface work your way</h1>
          <div class="settings-search"><v-text-field label="Search settings" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" aria-label="Open regex builder for settings search"/></div>
          <v-tabs v-model="settingsTab" show-arrows><v-tab v-for="tab in ['language','appearance','accessibility','schedules','privacy','advanced']" :key="tab" :value="tab">{{ tab }}</v-tab></v-tabs>
          <v-window v-model="settingsTab" class="settings-window">
            <v-window-item value="language"><section><h2>Language and tone</h2><v-select v-if="!settings.schoolMode" v-model="settings.language" label="Language" :items="[{title:'English',value:'en'},{title:'Playful Hong Kong-style Cantonese',value:'zh-HK'},{title:'Bilingual',value:'bilingual'}]"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyEnglish" min="1" max="5" step="1" thumb-label label="English funny level"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyCantonese" min="1" max="5" step="1" thumb-label label="Cantonese funny level"/><p v-if="!settings.schoolMode">Both funny levels default to 5 and style every message, including warnings and errors. Facts and choices never change.</p><v-switch v-model="settings.dialogEmoji" label="Show emojis in dialogs and message boxes"/><v-divider/><v-switch v-model="settings.schoolMode" :label="settings.schoolName"/><v-text-field v-model="settings.schoolName" label="Name of this mode"/><p>While active, this mode uses English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum capabilities from user-facing surfaces. Turning it off requires the shared local unlock method.</p></section></v-window-item>
            <v-window-item value="appearance"><section><h2>Appearance</h2><v-select v-model="settings.theme" label="Theme" :items="['system','light','dark']"/><v-select v-model="settings.density" label="Density" :items="['comfortable','compact','spacious']"/><div class="color-grid"><v-color-picker v-model="settings.accent" mode="hexa" show-swatches/><div><v-text-field v-model="settings.accent" label="Accent HEX or HEX8"/><v-switch v-model="settings.rainbow" label="Animated rainbow color"/><v-slider v-if="settings.rainbow" v-model="settings.rainbowSpeed" min="1" max="5" step="1" label="Rainbow speed level" thumb-label/><p>Contrast against the current surface: {{ contrast }}:1</p><v-list density="compact"><v-list-item v-for="row in accentRepresentations" :key="row[0]" :title="row[0]" :subtitle="row[1]"/></v-list></div></div><v-text-field v-model="settings.fontFamily" label="Interface font family"/><v-slider v-model="settings.fontScale" min="0.8" max="1.6" step="0.05" label="Font size scale" thumb-label/><v-text-field v-model="settings.appName" label="Displayed application name" hint="This does not change package identity, data folders, installer identity, or update feeds." persistent-hint/><v-select v-model="settings.dock" label="Tab and navigation dock" :items="['left','right','top','bottom']"/><v-btn @click="editAppearance('Settings page')">Edit this page appearance…</v-btn><v-file-input label="Custom application logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="loadLogo"/></section></v-window-item>
            <v-window-item value="accessibility"><section><h2>Accessibility and attention accommodations</h2><v-switch v-model="settings.reducedMotion" label="Reduce motion"/><v-switch v-model="settings.adhdFocus" label="Focus: emphasize the current work"/><v-switch v-model="settings.adhdLowStim" label="Low stimulation: quieter color and motion"/><v-switch v-model="settings.adhdTime" label="Time awareness: show elapsed time"/><v-switch v-model="settings.adhdOneThing" label="One thing at a time: keep one chosen next action"/><v-switch v-model="settings.adhdMomentum" label="Momentum: offer a gentle dismissible prompt after inactivity"/><p>These are interface accommodations, not medical assessment or advice. Every mode is off by default and can be combined.</p><v-divider/><h3>Narrator</h3><v-switch v-model="settings.narrator" label="Narrate important events"/><v-select v-model="settings.narratorLanguage" label="Narrated language" :items="[{title:'English',value:'en'},{title:'Cantonese',value:'zh-HK'},{title:'Both, English then Cantonese',value:'both'}]"/><v-select v-model="settings.englishVoice" label="English voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>v.lang.startsWith('en')).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><v-select v-model="settings.cantoneseVoice" label="Cantonese voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>/zh.*(HK|Hant)/i.test(v.lang)).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><v-slider v-model="settings.speechRate" min="0.5" max="2" step="0.1" label="Speech rate"/><v-slider v-model="settings.speechPitch" min="0" max="2" step="0.1" label="Speech pitch"/><v-btn @click="narrate('MaterialPBX narrator preview. Your selected voice is ready.')">Preview voice</v-btn></section></v-window-item>
            <v-window-item value="schedules"><section><h2>Scheduled settings</h2><p>Rules use your local timezone. Cross-midnight rules continue into the next day. Later rules win when two enabled rules overlap.</p><v-card v-for="rule in scheduleRules" :key="rule.id" class="pa-4 mb-3"><v-switch v-model="rule.enabled" :label="rule.label"/><div class="schedule-grid"><v-select v-model="rule.days" label="Days" multiple chips :items="['Mon','Tue','Wed','Thu','Fri','Sat','Sun']"/><v-text-field v-model="rule.start" type="time" label="Start time"/><v-text-field v-model="rule.end" type="time" label="End time"/><v-select v-model="rule.source" label="Source" :items="['Local settings','Validated HTTPS API','Home Assistant boolean entity']"/></div></v-card><v-btn prepend-icon="mdi-plus">Add rule</v-btn></section></v-window-item>
            <v-window-item value="privacy"><section><h2>Local privacy</h2><v-file-input v-if="!settings.schoolMode" label="Personal vocabulary JSON" accept="application/json" @change="loadVocabulary"/><p v-if="!settings.schoolMode">{{ vocabularyStatus }}</p><v-btn v-if="!settings.schoolMode" variant="tonal" @click="localStorage.removeItem('materialpbx.personal-vocabulary.v1'); vocabularyStatus='No personal vocabulary file loaded'">Clear personal vocabulary</v-btn><p>Personal vocabulary parsing and caching stay on this device and are excluded from exports, logs, analytics, crash reports, history, and synchronization.</p><v-divider/><h3>Local history</h3><p>Settings and user-managed records are appended to local history. Credentials and authenticator secrets are never stored as plaintext history.</p><v-btn @click="openPage('history')">Open history</v-btn></section></v-window-item>
            <v-window-item value="advanced"><section><h2>Advanced controls</h2><v-switch v-model="expertMode" label="Show expert PBX controls"/><p>Expert controls expose direct Asterisk concepts with explanations and safe defaults. Raw configuration is never the only path.</p><v-select label="External editor" :items="['Visual Studio Code (auto-detect)','Visual Studio Code Insiders','Choose an executable…']"/><v-btn :disabled="props.surface !== 'desktop'" :title="props.surface !== 'desktop' ? 'Available in the desktop app' : undefined">Open current export in Visual Studio Code</v-btn><v-divider/><h3>Universal exclusions for this project</h3><p>The local Ollama suite manager and universal file converter are intentionally not included, by explicit project direction.</p></section></v-window-item>
          </v-window>
        </template>

        <template v-else-if="activePage === 'notifications'">
          <p class="eyebrow">NOTIFICATION CENTER</p><h1>Messages and recovery actions</h1><div class="toolbar"><v-btn @click="notices=[]">Dismiss all</v-btn><v-menu><template #activator="{props:menuProps}"><v-btn v-bind="menuProps">Bulk export</v-btn></template><v-list><v-list-item v-for="format in exportFormats" :key="format" :title="format" @click="exportView(format)"/></v-list></v-menu></div><v-card v-for="notice in notices" :key="notice.id" class="pa-4 mb-3"><h3>{{ notice.title }}</h3><p>{{ notice.body }}</p><small>{{ notice.at }}</small></v-card><v-card v-if="!notices.length" class="pa-8 text-center">No notifications yet.</v-card>
        </template>

        <template v-else-if="activePage === 'history'">
          <p class="eyebrow">LOCAL HISTORY</p><h1>Review changes without rewriting the past</h1><div class="toolbar"><v-text-field type="date" label="From date"/><v-select label="Action" multiple :items="[...new Set(history.map(item=>item.action))]"/><v-text-field label="Search history"/><v-btn icon="mdi-regex" aria-label="Open regex builder for history search"/></div><v-timeline side="end"><v-timeline-item v-for="entry in history" :key="entry.id" dot-color="primary"><strong>{{ entry.action }}</strong><p>{{ entry.at }}</p><v-btn variant="text">Restore as a new revision</v-btn></v-timeline-item></v-timeline><v-card v-if="!history.length" class="pa-8 text-center">No local revisions yet.</v-card>
        </template>

        <template v-else-if="activePage === 'authenticator'">
          <p class="eyebrow">LOCAL AUTHENTICATOR</p><h1>Time-based codes without cloud sync</h1><v-alert :type="supportsDesktopVault ? 'info':'warning'" variant="tonal">{{ supportsDesktopVault ? 'Secrets are stored in the operating-system credential vault. Ordinary exports omit them.' : 'This browser surface cannot use the operating-system credential vault. Add and reveal codes only in the desktop app.' }}</v-alert><div class="toolbar"><v-text-field label="Search issuer or account"/><v-btn icon="mdi-regex" aria-label="Open regex builder for authenticator search"/><v-btn color="primary" :disabled="!supportsDesktopVault">Add account</v-btn></div><v-card class="pa-8 text-center">No authenticator accounts registered.</v-card>
        </template>

        <template v-else-if="activePage === 'locks'">
          <p class="eyebrow">OPTIONAL LOCAL SPEED BUMPS</p><h1>Toy locks for individual elements</h1><v-alert type="warning" variant="tonal">These locks are for fun and organization. They do not encrypt data, secure the PBX, or protect anything from another person using this computer.</v-alert><div class="toolbar"><v-text-field label="Search locked elements"/><v-btn icon="mdi-regex" aria-label="Open regex builder for lock search"/><v-btn color="primary" @click="lockTarget='Current page';lockWizardOpen=true">Lock an element…</v-btn></div><v-card class="pa-8 text-center"><h2>No toy locks configured</h2><p>Every lock has its own password or time-based code and its own duration. Clearing this visitor’s site storage or the desktop application-data folder resets all locks.</p><v-btn variant="tonal" @click="openPage('support')">Forgotten a lock? Open Support Tickets</v-btn></v-card>
        </template>

        <template v-else-if="activePage === 'support'">
          <p class="eyebrow">FICTIONAL LOCAL SUPPORT DESK</p><h1>Support Tickets</h1><v-alert type="info" variant="tonal">Nothing is sent anywhere. No ticket exists outside this device, no network request is made, no data is collected, and nobody is reading it.</v-alert><div class="toolbar"><v-select label="Category" model-value="Locked out" :items="['Locked out','Cannot find a setting','Something else']"/><v-text-field v-model="ticketDescription" label="Description"/><v-btn color="primary" @click="createTicket">Create local ticket</v-btn></div><v-card v-for="ticket in tickets" :key="ticket.id" class="pa-5 mb-3"><div class="d-flex justify-space-between"><strong>{{ ticket.id }}</strong><v-chip>{{ ticket.status }}</v-chip></div><p>{{ ticket.category }} · {{ ticket.description }}</p><p>Resolution: clear this visitor’s browser storage, or open the MaterialPBX application-data folder from the desktop app and delete it yourself. This interface never deletes it for you.</p></v-card><v-card v-if="!tickets.length" class="pa-8 text-center">No local tickets yet.</v-card>
        </template>

        <template v-else-if="activePage === 'changelog'">
          <p class="eyebrow">RELEASE HISTORY</p><h1>Changelog</h1><div class="toolbar"><v-text-field type="date" label="From date"/><v-text-field type="date" label="To date"/><v-text-field label="Search changes"/><v-btn icon="mdi-regex" aria-label="Open regex builder for changelog search"/><v-btn @click="exportView('Markdown')">Export filtered view</v-btn></div><v-card class="pa-6"><div class="d-flex justify-space-between"><h2>0.1.0</h2><time datetime="2026-08-22">2026-08-22</time></div><h3>Added</h3><ul><li>Guided MaterialPBX web interface and Windows desktop lab.</li><li>Plain-language one-click onboarding and visual PBX feature destinations.</li><li>Landing and documentation surface with an explicit non-runtime boundary.</li></ul><p>Source commit will be linked after this release is committed and published; no neighboring commit is guessed.</p></v-card>
        </template>

        <template v-else-if="activePage === 'docs'">
          <p class="eyebrow">OFFLINE GUIDE</p><h1>Every feature, explained in plain language</h1><div class="toolbar"><v-text-field label="Search titles and article text"/><v-btn icon="mdi-regex" aria-label="Open regex builder for documentation search"/></div><div class="task-grid"><v-card v-for="item in pages.filter(item=>!['docs','settings'].includes(item.id))" :key="item.id" class="pa-5 task-card"><h3>{{ item.label }}</h3><p>{{ item.description }}</p><v-btn variant="text" @click="openPage(item.id)">Open feature</v-btn></v-card></div>
        </template>

        <template v-else>
          <div class="headline-row"><div><p class="eyebrow">{{ page.group.toUpperCase() }}</p><h1>{{ page.label }}</h1><p>{{ page.description }}</p></div><div class="d-flex ga-2"><v-btn variant="tonal" @click="expertMode=!expertMode">{{ expertMode ? 'Guided view' : 'Expert view' }}</v-btn><v-btn color="primary" prepend-icon="mdi-plus" @click="editorOpen=true">Create</v-btn></div></div>
          <v-alert v-if="expertMode" type="info" variant="tonal" class="mb-4">Expert view names the Asterisk and FreePBX concepts behind each control. Values still use typed pickers, switches, ranges, and validated fields instead of raw configuration text.</v-alert>
          <div class="toolbar"><v-text-field :label="`Search ${page.label}`" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" :aria-label="`Open regex builder for ${page.label} search`"/><v-select label="Status" :items="['All','Enabled','Disabled','Needs attention']"/><v-btn @click="exportView('JSON')">Export</v-btn><v-btn color="error" variant="tonal" @click="superConfirmOpen=true">Delete selected…</v-btn></div>
          <v-card class="empty-state pa-10 text-center"><div class="empty-icon">{{ page.icon }}</div><h2>No {{ page.label.toLowerCase() }} on this disconnected surface</h2><p>Connect a PBX to load real records, or create a local draft now. MaterialPBX never inserts fake live data.</p><v-btn color="primary" @click="editorOpen=true">Create local draft</v-btn></v-card>
        </template>
      </v-container>
    </v-main>

    <v-dialog v-model="connectDialog" max-width="720"><v-card><v-card-title>Connect a PBX server</v-card-title><v-card-text><p>Enter the HTTPS address of a MaterialPBX control service. Credentials are collected by the protected connection flow and are never placed in this page, logs, or exports.</p><v-text-field v-model="serverUrl" label="Server address" type="url" hint="Example: https://pbx.example.local" persistent-hint/><v-select label="Connection type" :items="['MaterialPBX control service','Pair another FreePBX-compatible server']"/><v-alert type="info" variant="tonal">The server certificate, API compatibility, permissions, Asterisk version, FreePBX version, firewall reachability, and clock are checked before the connection is accepted.</v-alert></v-card-text><v-card-actions><v-spacer/><v-btn @click="connectDialog=false">Cancel</v-btn><v-btn color="primary" @click="notify('Connection not attempted','This UI lane does not include the server control plane. Use the Docker deployment or connect after its service is running.','warning');connectDialog=false">Run preflight</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="editorOpen" max-width="760"><v-card><v-card-title>Create {{ page.label }}</v-card-title><v-card-subtitle>{{ page.description }}</v-card-subtitle><v-card-text><template v-for="field in currentForm" :key="field.key"><v-text-field v-if="field.type==='text'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/><v-number-input v-else-if="field.type==='number'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/><v-select v-else-if="field.type==='select'" v-model="editorValues[field.key]" :label="field.label" :items="field.options" :hint="field.help" persistent-hint/><v-slider v-else-if="field.type==='slider'" v-model="editorValues[field.key]" :label="field.label" :min="1" :max="field.key==='ringSeconds'?120:64" thumb-label/><v-switch v-else-if="field.type==='switch'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/></template></v-card-text><v-card-actions><v-spacer/><v-btn @click="editorOpen=false">Cancel</v-btn><v-btn color="primary" @click="saveEditor">Save local draft</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="paletteOpen" :fullscreen="false" max-width="860"><v-card class="palette"><v-card-title>Command palette</v-card-title><v-card-text><div class="search-row"><v-text-field v-model="paletteQuery" autofocus label="Search every page, command, setting, and appearance control" prepend-inner-icon="mdi-magnify"/><v-btn icon="mdi-regex" aria-label="Open regex builder for command palette search"/></div><v-list><v-list-item v-for="item in paletteResults" :key="item.id" :title="item.label" :subtitle="`${item.group} · ${item.description}`" @click="openPage(item.id);paletteOpen=false"/><v-list-item title="Theme"><template #append><v-select v-model="settings.theme" hide-details density="compact" :items="['system','light','dark']"/></template></v-list-item><v-list-item title="Narrator"><template #append><v-switch v-model="settings.narrator" hide-details/></template></v-list-item></v-list></v-card-text></v-card></v-dialog>

    <v-dialog v-model="appearanceDialog" max-width="860"><v-card><v-card-title>Edit appearance: {{ appearanceTarget }}</v-card-title><v-card-text><p>This anchored editor changes the selected element only. Unsupported properties remain visible with an explanation.</p><v-tabs><v-tab>Typography</v-tab><v-tab>Color</v-tab><v-tab>Shape</v-tab><v-tab>States</v-tab></v-tabs><div class="appearance-grid"><v-text-field label="Font family" :model-value="settings.fontFamily"/><v-number-input label="Font size" :model-value="16"/><v-select label="Weight" :items="[100,200,300,400,500,600,700,800,900]"/><v-checkbox label="Italic"/><v-select label="Underline" :items="['None','Single','Double','Dotted','Wavy']"/><v-select label="Strikethrough" :items="['None','Single','Double']"/><v-number-input label="Letter spacing" suffix="px"/><v-number-input label="Line height"/><v-number-input label="Corner radius" suffix="px"/><v-select label="Elevation" :items="[0,1,2,3,4,5]"/></div><v-btn color="primary" @click="appearanceDialog=false;recordHistory(`Changed appearance of ${appearanceTarget}`)">Apply to this element</v-btn></v-card-text></v-card></v-dialog>

    <v-dialog v-model="lockWizardOpen" max-width="680"><v-card><v-card-title>Lock this element: {{ lockTarget }}</v-card-title><v-card-text><v-alert type="warning" variant="tonal">This is a toy lock, not security or encryption. Clearing local site storage or the application-data folder resets it.</v-alert><v-select label="Unlock method" :items="['Password stored as a local verifier','Time-based code from your authenticator']"/><v-select label="Unlock duration" :items="['This surface only','5 minutes','30 minutes','Until the app closes']"/><v-text-field type="password" label="Create this lock’s credential" autocomplete="new-password"/><p>Each element receives its own credential. Nothing is sent to a server or included in exports and history.</p></v-card-text><v-card-actions><v-btn @click="lockWizardOpen=false">Cancel</v-btn><v-spacer/><v-btn color="primary" @click="lockWizardOpen=false;recordHistory(`Created a toy lock for ${lockTarget}`)">Create toy lock</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="superConfirmOpen" max-width="680" persistent><v-card><v-card-title>Confirm destructive action</v-card-title><v-card-text><p>This removes the selected local draft. It cannot affect a live PBX while disconnected.</p><div class="key-grid"><v-checkbox v-model="confirmKeys.one" label="Key 1: I selected the intended item"/><v-checkbox v-model="confirmKeys.two" label="Key 2: I reviewed what will be removed"/></div><v-slider v-model="confirmKeys.slider" :disabled="!(confirmKeys.one&&confirmKeys.two)" min="0" max="100" step="1" label="Slide fully to authorize" thumb-label/></v-card-text><v-card-actions><v-btn @click="superConfirmOpen=false">Emergency exit</v-btn><v-spacer/><v-btn color="error" :disabled="!(confirmKeys.one&&confirmKeys.two&&confirmKeys.slider===100)" @click="completeDestructiveAction">Complete removal</v-btn></v-card-actions></v-card></v-dialog>

    <v-snackbar v-if="dimSum" :model-value="true" location="bottom right" timeout="7000"><strong>{{ dimSum.name }}</strong><p>A small startup surprise from the public dim-sum catalog.</p></v-snackbar>
    <div class="snackbar-stack" aria-live="polite"><v-alert v-for="notice in notices.slice(0,3)" :key="notice.id" :type="notice.level" closable variant="elevated" @click:close="notices=notices.filter(item=>item.id!==notice.id)"><strong>{{ notice.title }}</strong><div>{{ notice.body }}</div></v-alert></div>
  </v-app>
</template>
