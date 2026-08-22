<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, resolveComponent, shallowRef, watch, type PropType } from 'vue'
import { createDisconnectedClient, createHttpClient, listLocalDrafts, MaterialPbxRequestError, removeLocalDraft, type CapabilitySnapshot, type ConnectionState, type HealthSnapshot, type MaterialPbxClient, type PbxResource, type PbxResourceKind } from '@materialpbx/client'
import { mdiAccountGroupOutline, mdiBellOutline, mdiBookOpenPageVariantOutline, mdiChevronRight, mdiCogOutline, mdiDotsVertical, mdiDownloadOutline, mdiGithub, mdiInformationOutline, mdiMagnify, mdiMessageProcessingOutline, mdiMicrosoftWindows, mdiPhoneIncomingOutline, mdiRegex, mdiRocketLaunchOutline, mdiServerNetwork, mdiShapeOutline, mdiSproutOutline, mdiTuneVariant, mdiVoicemail } from '@mdi/js'
import { contrastRatio, RAINBOW_SENTINEL, translateColor } from './color'
import { appendConferenceDigit, conferenceDefaults, conferenceFieldErrors, conferencePresetValues, conferenceReviewItems, removeConferenceDigit, serializeConferenceDraft, validateConferenceDraft, type ConferenceDraft, type ConferenceField, type ConferencePreset } from './conference'
import { compileSearch } from './regex'

const props = withDefaults(defineProps<{ surface?: 'web' | 'desktop' | 'site' }>(), { surface: 'web' })
const client = shallowRef<MaterialPbxClient>(createDisconnectedClient())

interface PickerChoice { title: string; value: unknown }
interface ActionChoice { id: string; label: string; description?: string; disabled?: boolean }
let pickerInstanceId = 0
const componentElement = (value: unknown): HTMLElement | null => {
  if (value instanceof HTMLElement) return value
  const candidate = (value as { $el?: unknown } | null)?.$el
  return candidate instanceof HTMLElement ? candidate : null
}
const normalizePickerChoice = (item: unknown): PickerChoice => {
  if (item && typeof item === 'object') {
    const candidate = item as { title?: unknown; value?: unknown }
    const value = Object.prototype.hasOwnProperty.call(candidate, 'value') ? candidate.value : candidate.title
    return { title: String(candidate.title ?? value ?? ''), value }
  }
  return { title: String(item ?? ''), value: item }
}
const validateRegexFlags = (regex: boolean, flags: string) => {
  if (!regex) return undefined
  const requested = [...flags]
  if (requested.some((flag) => !'gimsuy'.includes(flag))) return 'Flags may contain only g, i, m, s, u, or y.'
  if (new Set(requested).size !== requested.length) return 'Each regular-expression flag can appear only once.'
  return undefined
}
function useInstanceSearch(values: () => Array<{ searchText: string }>) {
  const query = ref('')
  const regex = ref(false)
  const flags = ref('i')
  const builderOpen = ref(false)
  const flagError = computed(() => validateRegexFlags(regex.value, flags.value))
  const compiled = computed(() => flagError.value
    ? { matcher: () => false, error: flagError.value }
    : compileSearch({ query: query.value, regex: regex.value, flags: flags.value }))
  const filteredIndexes = computed(() => values().map((item, index) => ({ item, index })).filter(({ item }) => compiled.value.matcher(item.searchText)).map(({ index }) => index))
  return { query, regex, flags, builderOpen, compiled, filteredIndexes }
}

const SearchablePicker = defineComponent({
  name: 'SearchablePicker',
  inheritAttrs: false,
  props: {
    modelValue: { default: undefined },
    items: { type: Array as PropType<unknown[]>, default: () => [] },
    label: { type: String, required: true },
    multiple: Boolean,
    disabled: Boolean,
    hint: { type: String, default: '' },
    persistentHint: Boolean,
    noDataText: { type: String, default: 'No matching choices' },
    density: { type: String, default: undefined },
    hideDetails: Boolean,
  },
  emits: ['update:modelValue'],
  setup(componentProps, { attrs, emit }) {
    const instanceId = `materialpbx-picker-${++pickerInstanceId}`
    const menuOpen = ref(false)
    const activator = ref<unknown>(null)
    const card = ref<unknown>(null)
    const choices = computed(() => componentProps.items.map(normalizePickerChoice))
    const search = useInstanceSearch(() => choices.value.map((choice) => ({ searchText: choice.title })))
    const filteredChoices = computed(() => search.filteredIndexes.value.map((index) => choices.value[index]))
    const selectedValues = computed(() => componentProps.multiple ? Array.isArray(componentProps.modelValue) ? componentProps.modelValue : [] : [componentProps.modelValue])
    const selectedLabels = computed(() => choices.value.filter((choice) => selectedValues.value.some((value) => Object.is(value, choice.value))).map((choice) => choice.title))
    const displayValue = computed(() => selectedLabels.value.length ? selectedLabels.value.join(', ') : 'Choose')
    const focusActivator = () => nextTick(() => componentElement(activator.value)?.focus())
    watch(menuOpen, (open, previous) => { if (!open && previous) focusActivator() })
    function choose(choice: PickerChoice) {
      if (componentProps.multiple) {
        const current = [...selectedValues.value]
        const existing = current.findIndex((value) => Object.is(value, choice.value))
        if (existing >= 0) current.splice(existing, 1)
        else current.push(choice.value)
        emit('update:modelValue', current)
      } else {
        emit('update:modelValue', choice.value)
        menuOpen.value = false
      }
    }
    function onEscape(event: KeyboardEvent) {
      event.preventDefault()
      event.stopPropagation()
      if (search.builderOpen.value) search.builderOpen.value = false
      else if (search.query.value) search.query.value = ''
      else menuOpen.value = false
    }
    function focusFirstResult() {
      nextTick(() => componentElement(card.value)?.querySelector<HTMLElement>('.searchable-picker-option:not([aria-disabled="true"])')?.focus())
    }
    return () => {
      const VMenu = resolveComponent('VMenu') as any
      const VBtn = resolveComponent('VBtn') as any
      const VCard = resolveComponent('VCard') as any
      const VCardTitle = resolveComponent('VCardTitle') as any
      const VCardText = resolveComponent('VCardText') as any
      const VTextField = resolveComponent('VTextField') as any
      const VSwitch = resolveComponent('VSwitch') as any
      const VList = resolveComponent('VList') as any
      const VListItem = resolveComponent('VListItem') as any
      const VChip = resolveComponent('VChip') as any
      return h('div', { ...attrs, class: ['searchable-picker-field', attrs.class], 'data-picker-id': instanceId }, [
        h(VMenu, { modelValue: menuOpen.value, 'onUpdate:modelValue': (value: boolean) => { menuOpen.value = value }, closeOnContentClick: false, location: 'bottom start' }, {
          activator: ({ props: menuProps }: { props: Record<string, unknown> }) => h(VBtn, { ...menuProps, ref: activator, class: 'searchable-picker-activator', variant: 'outlined', disabled: componentProps.disabled, density: componentProps.density, appendIcon: 'mdi-chevron-down', 'aria-label': `${componentProps.label}: ${displayValue.value}` }, { default: () => [h('span', { class: 'searchable-picker-label' }, componentProps.label), h('span', { class: 'searchable-picker-value' }, displayValue.value)] }),
          default: () => h(VCard, { ref: card, class: 'searchable-picker-card', role: 'dialog', 'aria-label': `Choose ${componentProps.label}`, onKeydown: (event: KeyboardEvent) => { if (event.key === 'Escape') onEscape(event) } }, {
            default: () => [
              h(VCardTitle, {}, { default: () => componentProps.label }),
              h(VCardText, {}, { default: () => [
                h('div', { class: 'search-row' }, [
                  h(VTextField, { modelValue: search.query.value, 'onUpdate:modelValue': (value: unknown) => { search.query.value = String(value ?? '') }, autofocus: true, label: `Filter ${componentProps.label}`, prependInnerIcon: 'mdi-magnify', hideDetails: true, clearable: true, onKeydown: (event: KeyboardEvent) => { if (event.key === 'ArrowDown') { event.preventDefault(); focusFirstResult() } } }),
                  h(VBtn, { icon: 'mdi-regex', color: search.regex.value ? 'primary' : undefined, 'aria-label': `Open regular-expression builder for ${componentProps.label}`, 'aria-expanded': search.builderOpen.value, onClick: () => { search.builderOpen.value = !search.builderOpen.value } }),
                ]),
                search.builderOpen.value ? h('section', { class: 'searchable-picker-regex', 'aria-label': `Regular-expression builder for ${componentProps.label}` }, [
                  h(VSwitch, { modelValue: search.regex.value, 'onUpdate:modelValue': (value: boolean) => { search.regex.value = value }, label: 'Use regular expression', hideDetails: true }),
                  h(VTextField, { modelValue: search.flags.value, 'onUpdate:modelValue': (value: unknown) => { search.flags.value = String(value ?? '') }, label: 'Flags', hint: 'Supported JavaScript flags: g i m s u y', persistentHint: true }),
                  h('div', { class: 'builder-chips' }, ['^', '$', '[abc]', '(group)', 'a|b', '+', '*', '?'].map((token) => h(VChip, { key: token, onClick: () => { search.query.value += token } }, { default: () => token }))),
                ]) : null,
                h('p', { class: 'search-result-count', role: 'status', 'aria-live': 'polite' }, `${filteredChoices.value.length} of ${choices.value.length} choices shown`),
                search.compiled.value.error ? h('p', { class: 'text-error', role: 'alert' }, search.compiled.value.error) : null,
                h(VList, { role: 'listbox', 'aria-multiselectable': componentProps.multiple || undefined }, { default: () => filteredChoices.value.length ? filteredChoices.value.map((choice) => h(VListItem, { key: `${choice.title}-${String(choice.value)}`, class: 'searchable-picker-option', title: choice.title, active: selectedValues.value.some((value) => Object.is(value, choice.value)), role: 'option', 'aria-selected': selectedValues.value.some((value) => Object.is(value, choice.value)), onClick: () => choose(choice), onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(choice) } } })) : [h(VListItem, { title: componentProps.noDataText, subtitle: 'Clear the filter or correct the regular expression.', disabled: true })] }),
              ] }),
            ],
          }),
        }),
        componentProps.hint && (componentProps.persistentHint || !componentProps.hideDetails) ? h('p', { class: 'searchable-picker-hint' }, componentProps.hint) : null,
      ])
    }
  },
})

const SearchableActionMenu = defineComponent({
  name: 'SearchableActionMenu',
  props: {
    label: { type: String, required: true },
    icon: { type: String, default: '' },
    actions: { type: Array as PropType<ActionChoice[]>, required: true },
  },
  emits: ['activate'],
  setup(componentProps, { emit }) {
    const menuOpen = ref(false)
    const activator = ref<unknown>(null)
    const card = ref<unknown>(null)
    const search = useInstanceSearch(() => componentProps.actions.map((action) => ({ searchText: `${action.label} ${action.description ?? ''}` })))
    const filteredActions = computed(() => search.filteredIndexes.value.map((index) => componentProps.actions[index]))
    const focusActivator = () => nextTick(() => componentElement(activator.value)?.focus())
    watch(menuOpen, (open, previous) => { if (!open && previous) focusActivator() })
    function run(action: ActionChoice) {
      if (action.disabled) return
      emit('activate', action.id)
      menuOpen.value = false
    }
    function onEscape(event: KeyboardEvent) {
      event.preventDefault(); event.stopPropagation()
      if (search.builderOpen.value) search.builderOpen.value = false
      else if (search.query.value) search.query.value = ''
      else menuOpen.value = false
    }
    function focusFirstResult() { nextTick(() => componentElement(card.value)?.querySelector<HTMLElement>('.searchable-action-option:not([aria-disabled="true"])')?.focus()) }
    return () => {
      const VMenu = resolveComponent('VMenu') as any
      const VBtn = resolveComponent('VBtn') as any
      const VCard = resolveComponent('VCard') as any
      const VCardTitle = resolveComponent('VCardTitle') as any
      const VCardText = resolveComponent('VCardText') as any
      const VTextField = resolveComponent('VTextField') as any
      const VSwitch = resolveComponent('VSwitch') as any
      const VList = resolveComponent('VList') as any
      const VListItem = resolveComponent('VListItem') as any
      return h(VMenu, { modelValue: menuOpen.value, 'onUpdate:modelValue': (value: boolean) => { menuOpen.value = value }, closeOnContentClick: false, location: 'bottom end' }, {
        activator: ({ props: menuProps }: { props: Record<string, unknown> }) => h(VBtn, { ...menuProps, ref: activator, prependIcon: componentProps.icon || undefined, 'aria-label': componentProps.label }, { default: () => componentProps.label }),
        default: () => h(VCard, { ref: card, class: 'searchable-picker-card', role: 'dialog', 'aria-label': componentProps.label, onKeydown: (event: KeyboardEvent) => { if (event.key === 'Escape') onEscape(event) } }, { default: () => [
          h(VCardTitle, {}, { default: () => componentProps.label }),
          h(VCardText, {}, { default: () => [
            h('div', { class: 'search-row' }, [h(VTextField, { modelValue: search.query.value, 'onUpdate:modelValue': (value: unknown) => { search.query.value = String(value ?? '') }, autofocus: true, label: `Filter ${componentProps.label}`, prependInnerIcon: 'mdi-magnify', hideDetails: true, clearable: true, onKeydown: (event: KeyboardEvent) => { if (event.key === 'ArrowDown') { event.preventDefault(); focusFirstResult() } } }), h(VBtn, { icon: 'mdi-regex', color: search.regex.value ? 'primary' : undefined, 'aria-label': `Open regular-expression builder for ${componentProps.label}`, 'aria-expanded': search.builderOpen.value, onClick: () => { search.builderOpen.value = !search.builderOpen.value } })]),
            search.builderOpen.value ? h('section', { class: 'searchable-picker-regex', 'aria-label': `Regular-expression builder for ${componentProps.label}` }, [h(VSwitch, { modelValue: search.regex.value, 'onUpdate:modelValue': (value: boolean) => { search.regex.value = value }, label: 'Use regular expression', hideDetails: true }), h(VTextField, { modelValue: search.flags.value, 'onUpdate:modelValue': (value: unknown) => { search.flags.value = String(value ?? '') }, label: 'Flags', hint: 'Supported JavaScript flags: g i m s u y', persistentHint: true }), h('div', { class: 'builder-chips' }, ['^', '$', '[abc]', '(group)', 'a|b', '+', '*', '?'].map((token) => h(resolveComponent('VChip') as any, { key: token, onClick: () => { search.query.value += token } }, { default: () => token })))]) : null,
            h('p', { class: 'search-result-count', role: 'status', 'aria-live': 'polite' }, `${filteredActions.value.length} of ${componentProps.actions.length} actions shown`),
            search.compiled.value.error ? h('p', { class: 'text-error', role: 'alert' }, search.compiled.value.error) : null,
            h(VList, {}, { default: () => filteredActions.value.length ? filteredActions.value.map((action) => h(VListItem, { key: action.id, class: 'searchable-action-option', title: action.label, subtitle: action.description, disabled: action.disabled, onClick: () => run(action), onKeydown: (event: KeyboardEvent) => { if (!action.disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); run(action) } } })) : [h(VListItem, { title: 'No matching actions', subtitle: 'Clear the filter or correct the regular expression.', disabled: true })] }),
          ] }),
        ] }),
      })
    }
  },
})

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
  { id: 'ring-groups', label: 'Ring groups', icon: 'ring_volume', group: 'Call flows', description: 'Ring several phones together, then use a clear no-answer destination.' },
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
interface SearchState { query: string; regex: boolean; flags: string }
type SearchTarget = 'settings' | 'history' | 'authenticator' | 'locks' | 'changelog' | 'docs' | 'feature' | 'palette'
const makeSearchState = (): SearchState => reactive({ query: '', regex: false, flags: 'i' })
const navSearch = makeSearchState()
const navRegexOpen = ref(false)
const navCompiled = computed(() => compileSearch(navSearch))
const regexDialogOpen = ref(false)
const regexContext = ref('Search')
const regexTarget = ref<SearchTarget | null>(null)
const regexDraft = makeSearchState()
const regexDraftResult = computed(() => compileSearch(regexDraft))
const settingsSearch = makeSearchState()
const historySearch = makeSearchState()
const authenticatorSearch = makeSearchState()
const locksSearch = makeSearchState()
const changelogSearch = makeSearchState()
const docsSearch = makeSearchState()
const featureSearch = makeSearchState()
const paletteSearch = makeSearchState()
const searchTargets: Record<SearchTarget, SearchState> = {
  settings: settingsSearch,
  history: historySearch,
  authenticator: authenticatorSearch,
  locks: locksSearch,
  changelog: changelogSearch,
  docs: docsSearch,
  feature: featureSearch,
  palette: paletteSearch,
}
const regexReturnFocus = ref<HTMLElement | null>(null)
function openRegexBuilder(context: string, target: SearchTarget, event?: Event) {
  regexContext.value = context
  regexTarget.value = target
  Object.assign(regexDraft, searchTargets[target])
  regexReturnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null
  regexDialogOpen.value = true
}
function finishRegexBuilder(apply: boolean) {
  if (apply && regexTarget.value && !regexDraftResult.value.error) Object.assign(searchTargets[regexTarget.value], regexDraft)
  regexDialogOpen.value = false
  nextTick(() => regexReturnFocus.value?.focus())
}
watch(regexDialogOpen, (open, previous) => {
  if (!open && previous) nextTick(() => regexReturnFocus.value?.focus())
})
const filteredPages = computed(() => pages.filter((item) => navCompiled.value.matcher(`${item.label} ${item.description} ${item.group}`)))
const productFeaturePages = computed(() => pages.filter((item) => ['People & phones', 'Calling', 'Call flows', 'Reports', 'Advanced', 'System'].includes(item.group) && item.id !== 'status'))
const candidateVersion = '0.1.2'
const latestPublishedVersion = '0.1.1'
const latestPublishedTag = 'build-121-3f31f81'
const installerDownloadUrl = `https://github.com/Ding-Ding-Projects/MaterialPBX/releases/download/${latestPublishedTag}/MaterialPBX-${latestPublishedVersion}-x64-Setup.exe`
const siteIcons = {
  accountGroup: mdiAccountGroupOutline,
  bell: mdiBellOutline,
  book: mdiBookOpenPageVariantOutline,
  chevron: mdiChevronRight,
  cog: mdiCogOutline,
  download: mdiDownloadOutline,
  feature: mdiShapeOutline,
  github: mdiGithub,
  information: mdiInformationOutline,
  magnify: mdiMagnify,
  message: mdiMessageProcessingOutline,
  more: mdiDotsVertical,
  phoneIncoming: mdiPhoneIncomingOutline,
  regex: mdiRegex,
  rocket: mdiRocketLaunchOutline,
  server: mdiServerNetwork,
  sprout: mdiSproutOutline,
  tune: mdiTuneVariant,
  voicemail: mdiVoicemail,
  windows: mdiMicrosoftWindows,
} as const
const sitePreview = reactive({ destination: 'Ring a group of phones', ringSeconds: 20, encryptVoice: true })
const sitePreviewSummary = computed(() => `${sitePreview.destination} for ${sitePreview.ringSeconds} seconds, then continue to the configured no-answer destination. Voice encryption is ${sitePreview.encryptVoice ? 'requested when supported' : 'not requested'}.`)
type SiteDemoMode = 'open' | 'closed' | 'overflow'
const siteDemoMode = ref<SiteDemoMode>('open')
const siteDemoModes: Array<{ id: SiteDemoMode; label: string; eyebrow: string; title: string; detail: string; result: string; color: string }> = [
  { id: 'open', label: 'Office open', eyebrow: '09:00 · TUESDAY', title: 'Welcome the caller', detail: 'Play the greeting, then ring Sales and Support together for 20 seconds.', result: 'Team ring group', color: 'primary' },
  { id: 'closed', label: 'After hours', eyebrow: '20:42 · TUESDAY', title: 'Respect opening hours', detail: 'Skip the office phones, explain when the team returns, then offer voicemail.', result: 'After-hours voicemail', color: 'tertiary' },
  { id: 'overflow', label: 'Nobody answers', eyebrow: '20 SECONDS ELAPSED', title: 'Keep the caller moving', detail: 'The first destination did not answer, so continue to the visible no-answer route.', result: 'Overflow destination', color: 'secondary' },
]
const siteDemo = computed(() => siteDemoModes.find((mode) => mode.id === siteDemoMode.value) ?? siteDemoModes[0])
const siteFeatureGroups = computed(() => [...new Set(productFeaturePages.value.map((item) => item.group))].map((group) => ({
  group,
  items: productFeaturePages.value.filter((item) => item.group === group),
})))

const pagePanel = ref<HTMLElement | null>(null)
const pageAnnouncement = ref('Home page ready')
const tabFocusId = ref<PageId>('home')
const compactTabLayout = ref(false)
const effectiveTabDock = computed<Dock>(() => compactTabLayout.value ? 'top' : settings.dock)
let tabDockMedia: MediaQueryList | undefined
const updateTabDockLayout = () => { compactTabLayout.value = Boolean(tabDockMedia?.matches) }
const tabId = (id: PageId) => `materialpbx-tab-${id}`
const tabPanelId = (id: PageId) => `materialpbx-panel-${id}`
const unwrapElement = (value: unknown): HTMLElement | null => {
  if (value instanceof HTMLElement) return value
  const candidate = (value as { $el?: unknown } | null)?.$el
  return candidate instanceof HTMLElement ? candidate : null
}
function focusTab(id: PageId) {
  tabFocusId.value = id
  nextTick(() => document.getElementById(tabId(id))?.focus())
}
function focusDestination(id: PageId) {
  nextTick(() => {
    const label = pages.find((item) => item.id === id)?.label ?? id
    document.title = `${label} · ${settings.appName}`
    pageAnnouncement.value = `${label} page opened`
    pagePanel.value?.focus({ preventScroll: true })
    pagePanel.value?.scrollIntoView({ block: 'start' })
  })
}
function openPage(id: PageId) {
  activePage.value = id
  tabFocusId.value = id
  if (!openTabs.value.includes(id)) openTabs.value.push(id)
  recordHistory(`Opened ${pages.find((item) => item.id === id)?.label ?? id}`)
  focusDestination(id)
}

function closeTab(id: PageId) {
  if (pinnedTabs.value.includes(id)) return notify('Pinned tab', 'Unpin this tab before closing it.', 'warning')
  const closingIndex = openTabs.value.indexOf(id)
  openTabs.value = openTabs.value.filter((tab) => tab !== id)
  const nextId = activePage.value === id ? openTabs.value[Math.max(0, closingIndex - 1)] ?? openTabs.value.at(-1) ?? 'home' : activePage.value
  activePage.value = nextId
  const nextLabel = pages.find((item) => item.id === nextId)?.label ?? nextId
  document.title = `${nextLabel} · ${settings.appName}`
  pageAnnouncement.value = `${pages.find((item) => item.id === id)?.label ?? id} tab closed. ${nextLabel} tab is active.`
  focusTab(nextId)
}
function onTabKeydown(event: KeyboardEvent, id: PageId) {
  const index = openTabs.value.indexOf(id)
  if (index < 0) return
  const vertical = effectiveTabDock.value === 'left' || effectiveTabDock.value === 'right'
  let targetIndex: number | null = null
  if (event.key === 'Home') targetIndex = 0
  else if (event.key === 'End') targetIndex = openTabs.value.length - 1
  else if ((vertical && event.key === 'ArrowUp') || (!vertical && event.key === 'ArrowLeft')) targetIndex = (index - 1 + openTabs.value.length) % openTabs.value.length
  else if ((vertical && event.key === 'ArrowDown') || (!vertical && event.key === 'ArrowRight')) targetIndex = (index + 1) % openTabs.value.length
  if (targetIndex === null) return
  event.preventDefault()
  focusTab(openTabs.value[targetIndex])
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

const resourcePageIds = new Set<PbxResourceKind>(['extensions','users','devices','trunks','inbound-routes','outbound-routes','ivrs','queues','ring-groups','conferences','voicemail','recordings','cdr','cel','calendars','presence','parking','paging','announcements','time-conditions','webrtc','paired-servers','backups','observability','security'])
const isResourcePage = (value: PageId): value is PbxResourceKind => resourcePageIds.has(value as PbxResourceKind)
const currentAccess = computed(() => isResourcePage(activePage.value) ? resourceAccess.value[activePage.value] ?? 'unknown' : 'unknown')
const canWriteCurrent = computed(() => currentAccess.value === 'write')
const canAttemptWriteCurrent = computed(() => !['read-only', 'denied'].includes(currentAccess.value))
const currentResources = computed(() => isResourcePage(activePage.value) ? resourceRows.value[activePage.value] ?? [] : [])
const connectionLabel = computed(() => props.surface === 'site' ? 'Documentation site' : ({ disconnected: 'Disconnected', connecting: 'Checking server', connected: 'Live connection', degraded: 'Live with warnings', offline: 'Server offline', 'permission-denied': 'Permission needed', incompatible: 'Incompatible server' }[connection.value]))
const connectionColor = computed(() => props.surface === 'site' ? 'info' : ({ connected: 'success', degraded: 'warning', connecting: 'info', disconnected: 'warning', offline: 'error', 'permission-denied': 'warning', incompatible: 'error' }[connection.value]))

async function loadResources(kind: PbxResourceKind) {
  const localDrafts = listLocalDrafts(kind)
  if (!['connected', 'degraded'].includes(connection.value)) { resourceRows.value[kind] = localDrafts; return }
  resourceLoading.value = true
  try {
    const serverResources = await client.value.list(kind)
    resourceRows.value[kind] = [...localDrafts, ...serverResources]
    if (resourceAccess.value[kind] !== 'write') resourceAccess.value[kind] = 'read'
  }
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
  client.value = createDisconnectedClient(); connection.value = 'disconnected'; connectionMessage.value = 'Disconnected by this user. The saved endpoint remains available for the next preflight.'; healthSnapshot.value = null; capabilitySnapshot.value = null; resourceRows.value = {}; resourceAccess.value = {}; serverCredential.value = ''; if (isResourcePage(activePage.value)) resourceRows.value[activePage.value] = listLocalDrafts(activePage.value); notify('Control service disconnected', 'The in-memory credential was discarded. No live PBX changes can be made until preflight succeeds again.', 'info')
}
function clearSavedEndpoint() { localStorage.removeItem('materialpbx.control-endpoint.v1'); serverUrl.value = ''; notify('Saved endpoint cleared', 'Only the non-secret server address was removed. No credential was stored here.', 'info') }

const onboardingStep = ref(1)
const onboarding = reactive({
  serverName: 'My phone system', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  country: 'CA', emergencyNumber: '911', emergencyConfirmed: false, extensionStart: 100,
  extensionDigits: 3, deviceType: 'softphone', provider: 'I will connect a phone company later',
  publicNumber: '', nat: 'automatic', firewall: 'recommended', tls: true, srtp: true,
  inboundDestination: 'First extension', outboundProfile: 'Internal only until verified',
  backupSchedule: 'Every night', testDestination: '',
})
const storedOnboarding = localStorage.getItem('materialpbx.onboarding-draft.v1')
if (storedOnboarding) {
  try { Object.assign(onboarding, JSON.parse(storedOnboarding)) }
  catch { localStorage.removeItem('materialpbx.onboarding-draft.v1') }
}
const onboardingSnapshot = () => JSON.stringify(onboarding)
const savedOnboardingSnapshot = ref(onboardingSnapshot())
function saveOnboardingDraft() {
  const snapshot = onboardingSnapshot()
  localStorage.setItem('materialpbx.onboarding-draft.v1', snapshot)
  savedOnboardingSnapshot.value = snapshot
  recordHistory('Saved onboarding draft')
  notify('Draft saved', 'The onboarding draft is stored locally.', 'success')
}
function discardOnboardingChanges() {
  Object.assign(onboarding, JSON.parse(savedOnboardingSnapshot.value))
  notify('Onboarding changes discarded', 'The last locally saved onboarding draft is restored.', 'info')
}

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
  'ring-groups': [
    { key: 'number', label: 'Ring-group number', type: 'number', help: 'A short internal number that reaches every selected member.' },
    { key: 'strategy', label: 'How phones ring', type: 'select', options: ['ringall', 'hunt', 'memoryhunt', 'firstavailable'], help: 'Ring all is the simplest safe start. The other strategies change member order.' },
    { key: 'memberExtensionIds', label: 'Phones and extensions', type: 'members', help: 'Choose one to 64 existing extension or endpoint identifiers.' },
    { key: 'ringSeconds', label: 'Ring time', type: 'slider', help: 'How long this group rings before the no-answer destination.' },
    { key: 'failoverDestination', label: 'No-answer destination', type: 'select', options: ['Voicemail', 'Queue', 'Announcement', 'Hang up'], help: 'The next safe step when nobody in the group answers.' },
    { key: 'enabled', label: 'Accept calls', type: 'switch', help: 'Turn the group off without deleting its plan.' },
  ],
  conferences: [],
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

const visualFeatureKinds = new Set<PbxResourceKind>(['extensions','trunks','inbound-routes','outbound-routes','ivrs','queues','ring-groups','conferences','observability','paired-servers'])
const visualFeature = computed(() => isResourcePage(activePage.value) && visualFeatureKinds.has(activePage.value) ? ({
  extensions: { eyebrow: 'PEOPLE AND PHONES', lead: 'Give each person a short number and decide which real devices ring.', default: 'Suggested start: three-digit extensions beginning at 100, voicemail on, 25-second ring time.', icon: '☎' },
  trunks: { eyebrow: 'PHONE COMPANY LINKS', lead: 'Configure a bounded PJSIP connection and see which outside links are healthy, encrypted, and within their call limits.', default: 'Suggested start: PJSIP with TLS when supported, the provider’s documented host and port, then add credentials only through its reviewed flow.', icon: '⇄' },
  'inbound-routes': { eyebrow: 'INCOMING CALL MAP', lead: 'Match each public number to the first destination callers should reach.', default: 'Suggested start: send the main number to a staffed queue, with voicemail as the after-hours fallback.', icon: '↘' },
  'outbound-routes': { eyebrow: 'OUTGOING CALL MAP', lead: 'Choose which healthy phone-company connection carries each kind of number.', default: 'Suggested start: separate emergency, local, and international rules so permissions stay reviewable.', icon: '↗' },
  ivrs: { eyebrow: 'VISUAL CALL-FLOW CANVAS', lead: 'Build the caller journey from greeting to key choices and safe fallbacks.', default: 'Suggested start: operator on 0, repeat once after an invalid key, then use a clear fallback.', icon: '⑴' },
  queues: { eyebrow: 'WAITING-LINE CONTROL', lead: 'Balance caller wait time, available people, and a humane fallback.', default: 'Suggested start: longest-idle strategy, 20-second attempts, and a visible maximum wait.', icon: '≋' },
  'ring-groups': { eyebrow: 'RING GROUP CONTROL', lead: 'Ring several existing phones together, then continue to one explicit no-answer destination.', default: 'Suggested start: ring all members for 20 seconds, then send the call to a verified voicemail box.', icon: '◎' },
  conferences: { eyebrow: 'CONFERENCE ROOM CONTROL', lead: 'Give a shared conversation one number, a clear capacity, and participant behavior everyone can review before it goes live.', default: 'Suggested start: room 700, 20 participants, and every optional behavior off. MaterialPBX never treats Asterisk’s unlimited room size as a safe default.', icon: '◉' },
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
const editingResourceRevision = ref<number | undefined>()
const editingResourceProvenance = ref<PbxResource['provenance']>()
const editorValues = reactive<Record<string, string | number | boolean>>({ name: '', enabled: true, ringSeconds: 25, concurrency: 4 })
const queueMembers = ref<Array<{ id: string; label: string }>>([])
const listMembers = ref<Array<{ id: string; label: string }>>([])
const editorBaselineSnapshot = ref('')
const editorIsNew = ref(false)
const editorCloseConfirmOpen = ref(false)
const editorReturnFocus = ref<HTMLElement | null>(null)
const conferenceRoomNameInput = ref<unknown>(null)
const conferenceNumberControl = ref<HTMLElement | null>(null)
const conferenceCapacityInput = ref<unknown>(null)
const currentForm = computed(() => resourceForms[activePage.value] ?? genericForm)
const membersKey = computed(() => currentForm.value.find((field) => field.type === 'members')?.key ?? '')
const activeMembers = computed(() => membersKey.value === 'memberExtensionIds' ? queueMembers.value : listMembers.value)
const membersEditorLabel = computed(() => membersKey.value === 'memberExtensionIds'
  ? activePage.value === 'ring-groups' ? 'Ring-group members' : 'Queue members'
  : ({ dialPatterns: 'Dial patterns', trunkIds: 'Trunk order', entries: 'IVR key choices', windows: 'Open windows' }[membersKey.value as 'dialPatterns' | 'trunkIds' | 'entries' | 'windows'] ?? 'Items'))
const membersFieldLabel = computed(() => ({ memberExtensionIds: 'Member extension or endpoint', dialPatterns: 'Asterisk dial pattern', trunkIds: 'Trunk identifier', entries: 'Key choice JSON, such as {"digit":"1","destination":{"type":"extension","id":"101"}}', windows: 'Window JSON, such as {"weekdays":[1],"start":"09:00","end":"17:00"}' }[membersKey.value as 'memberExtensionIds' | 'dialPatterns' | 'trunkIds' | 'entries' | 'windows'] ?? 'Identifier'))
const membersEmptyMessage = computed(() => membersKey.value === 'memberExtensionIds'
  ? activePage.value === 'ring-groups' ? 'No members yet. A ring group needs at least one phone or extension.' : 'No members yet. A queue needs at least one destination.'
  : `No ${membersEditorLabel.value.toLowerCase()} yet. This feature needs at least one item.`)
const editorSnapshot = () => JSON.stringify({ values: editorValues, queueMembers: queueMembers.value, listMembers: listMembers.value })
function openResourceEditor(resource?: PbxResource) {
  editorReturnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  editingResourceId.value = resource?.id ?? null
  editingResourceRevision.value = resource?.revision
  editingResourceProvenance.value = resource?.provenance
  Object.keys(editorValues).forEach((key) => delete editorValues[key])
  if (activePage.value === 'conferences') {
    const defaults = conferenceDefaults()
    Object.assign(editorValues, resource?.details ?? {}, { name: resource?.name ?? defaults.roomName, enabled: resource?.enabled ?? defaults.enabled })
  } else {
    Object.assign(editorValues, resource?.details ?? {}, { name: resource?.name ?? '', enabled: resource?.enabled ?? true, ringSeconds: resource?.details?.ringSeconds ?? 25, concurrency: resource?.details?.concurrency ?? 4, tls: resource?.details?.tls ?? true })
  }
  queueMembers.value = Array.isArray(resource?.details?.memberExtensionIds)
    ? resource.details.memberExtensionIds.map((value: unknown) => ({ id: crypto.randomUUID(), label: String(value) }))
    : []
  listMembers.value = membersKey.value && membersKey.value !== 'memberExtensionIds' && Array.isArray(resource?.details?.[membersKey.value])
    ? resource.details[membersKey.value].map((value: unknown) => ({ id: crypto.randomUUID(), label: String(value) }))
    : []
  editorIsNew.value = !resource
  editorBaselineSnapshot.value = editorSnapshot()
  editorOpen.value = true
}
function stageResourceEnabled(resource: PbxResource, enabled: boolean | null) {
  openResourceEditor(resource)
  editorValues.enabled = enabled === true
}
const editorIsDirty = computed(() => editorSnapshot() !== editorBaselineSnapshot.value)
function finishEditorClose() {
  editorOpen.value = false
  editorCloseConfirmOpen.value = false
  editorIsNew.value = false
  editorBaselineSnapshot.value = editorSnapshot()
  nextTick(() => editorReturnFocus.value?.focus())
}
function requestEditorClose(value = false) {
  if (value) { editorOpen.value = true; return }
  if (editorIsDirty.value) { editorCloseConfirmOpen.value = true; return }
  finishEditorClose()
}
function discardEditorDraft() { requestEditorClose(false) }
function confirmDiscardEditorDraft() {
  notify('Editor draft discarded', 'The open resource editor was closed without saving its current values.', 'info')
  finishEditorClose()
}
async function saveEditor() {
  if (!isResourcePage(activePage.value)) { recordHistory(`Updated ${page.value.label} local draft`); editorOpen.value = false; return }
  if (activePage.value === 'conferences' && conferenceErrors.value.length) {
    notify('Correct the conference settings', conferenceErrors.value.join(' '), 'warning')
    await focusConferenceFirstError()
    return
  }
  const name = String(editorValues.name || editorValues.number || `${page.value.label} draft`).trim()
  const details: Record<string, unknown> = activePage.value === 'conferences' ? serializeConferenceDraft(conferenceDraft.value) : { ...editorValues }
  if (activePage.value !== 'conferences' && membersKey.value === 'memberExtensionIds') details.memberExtensionIds = queueMembers.value.map((member) => member.label)
  else if (activePage.value !== 'conferences' && membersKey.value) details[membersKey.value] = listMembers.value.map((member) => member.label)
  const resource: PbxResource = { id: editingResourceId.value ?? `draft-${crypto.randomUUID()}`, kind: activePage.value, name, summary: page.value.description, enabled: editorValues.enabled === true, tags: [], updatedAt: new Date().toISOString(), revision: editingResourceRevision.value, provenance: editingResourceProvenance.value, details }
  if (!['connected', 'degraded'].includes(connection.value)) {
    const local = await client.value.save(resource)
    if (!local.ok || !local.resource) { notify('Local draft was not saved', local.message, 'error'); return }
    resourceRows.value[activePage.value] = await client.value.list(activePage.value)
    recordHistory(`Saved ${page.value.label} local draft`)
    notify('Saved locally only', 'No compatible PBX connection is live. This versioned draft is retained in local browser storage and was not sent to a phone system.', 'warning')
    finishEditorClose()
    return
  }
  if (!canAttemptWriteCurrent.value) { notify('Read-only server permission', `A previous request was refused for ${page.value.label}. No change was sent.`, 'warning'); return }
  const result = await client.value.save(resource)
  if (!result.ok) { if (result.state === 'permission-denied') resourceAccess.value[activePage.value] = currentAccess.value === 'read' ? 'read-only' : 'denied'; notify('PBX change was not applied', result.message, result.state === 'permission-denied' ? 'warning' : 'error'); return }
  if (editingResourceProvenance.value === 'local-draft') {
    try { removeLocalDraft(activePage.value, resource.id) }
    catch (error) { notify('PBX saved, but local cleanup did not finish', error instanceof Error ? error.message : 'The local draft could not be removed. It remains labelled as local and can be removed after storage access is restored.', 'warning') }
  }
  resourceAccess.value[activePage.value] = 'write'; await loadResources(activePage.value)
  if (activePage.value === 'conferences') {
    recordHistory('Conference configuration accepted by the control service; runtime verification pending')
    const application = result.application
    const outcome = application ? `Applied: ${application.applied ? 'yes' : 'no'}. Reloaded: ${application.reloaded ? 'yes' : 'no'}. Runtime verification: ${application.runtimeVerification}.` : 'The server did not return a structured native application result.'
    notify('Conference settings saved', `${result.message} ${outcome} A saved room is not described as live until a real call enters it.`, !application || !application.applied || !application.reloaded || application.partialFailure ? 'warning' : 'success')
  } else {
    recordHistory(`Applied ${page.value.label} change through the control service`)
    notify('PBX change confirmed', result.message, 'success')
  }
  finishEditorClose()
}

const conferenceDraft = computed<ConferenceDraft>(() => ({ ...editorValues, roomName: editorValues.name, enabled: editorValues.enabled } as ConferenceDraft))
const conferenceErrorsByField = computed(() => activePage.value === 'conferences' ? conferenceFieldErrors(conferenceDraft.value) : {})
const conferenceErrors = computed(() => activePage.value === 'conferences' ? validateConferenceDraft(conferenceDraft.value) : [])
const conferenceReview = computed(() => conferenceReviewItems(conferenceDraft.value))
const conferenceErrorMessages = (field: ConferenceField) => conferenceErrorsByField.value[field] ?? []
async function focusConferenceFirstError() {
  const field = (['roomName', 'enabled', 'number', 'maxParticipants', 'recordConference', 'announceJoinLeave', 'startMuted', 'musicOnHoldWhenEmpty', 'quiet'] as ConferenceField[]).find(candidate => conferenceErrorMessages(candidate).length)
  await nextTick()
  if (field === 'roomName') componentElement(conferenceRoomNameInput.value)?.querySelector('input')?.focus()
  else if (field === 'number') conferenceNumberControl.value?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  else if (field === 'maxParticipants') componentElement(conferenceCapacityInput.value)?.querySelector('input')?.focus()
  else document.querySelector<HTMLElement>(`[data-conference-field="${field}"] input`)?.focus()
}
function applyConferencePreset(preset: ConferencePreset) { Object.assign(editorValues, conferencePresetValues(preset)) }
function enterConferenceDigit(digit: number) { editorValues.number = appendConferenceDigit(editorValues.number ?? '', digit) }
function backspaceConferenceDigit() { editorValues.number = removeConferenceDigit(editorValues.number ?? '') }

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

watch(activePage, (value) => { if (isResourcePage(value)) void loadResources(value) }, { immediate: true })

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

const settingsEntries = [
  { tab: 'language', label: 'Language and tone', description: 'Language mode, funny levels, dialog emoji, and School mode.' },
  { tab: 'appearance', label: 'Appearance', description: 'Theme, density, accent, rainbow, fonts, displayed name, dock, and custom logo.' },
  { tab: 'accessibility', label: 'Accessibility and attention', description: 'Reduced motion, focus, low stimulation, time awareness, narrator, voices, rate, and pitch.' },
  { tab: 'schedules', label: 'Scheduled settings', description: 'Days, time windows, local settings, HTTPS sources, and Home Assistant sources.' },
  { tab: 'privacy', label: 'Local privacy', description: 'Personal vocabulary, local cache, reset, and local history.' },
  { tab: 'advanced', label: 'Advanced controls', description: 'Expert controls, external editor, desktop updates, and explicit exclusions.' },
]
const settingsCompiled = computed(() => compileSearch(settingsSearch))
const filteredSettingsEntries = computed(() => settingsEntries.filter((entry) => settingsCompiled.value.matcher(`${entry.label} ${entry.description}`)))
const historyFromDate = ref('')
const historyActions = ref<string[]>([])
const historyCompiled = computed(() => compileSearch(historySearch))
const availableHistoryActions = computed(() => [...new Set(history.value.map((item) => item.action))])
const filteredHistory = computed(() => history.value.filter((entry) => {
  if (historyFromDate.value && entry.at.slice(0, 10) < historyFromDate.value) return false
  if (historyActions.value.length && !historyActions.value.includes(entry.action)) return false
  return historyCompiled.value.matcher(`${entry.action} ${entry.at}`)
}))
const authenticatorEntries = ref<Array<{ issuer: string; account: string }>>([])
const authenticatorCompiled = computed(() => compileSearch(authenticatorSearch))
const filteredAuthenticatorEntries = computed(() => authenticatorEntries.value.filter((entry) => authenticatorCompiled.value.matcher(`${entry.issuer} ${entry.account}`)))
const lockedElementEntries = ref<Array<{ target: string; method: string }>>(JSON.parse(localStorage.getItem('materialpbx.toy-locks.v1') ?? '[]'))
const locksCompiled = computed(() => compileSearch(locksSearch))
const filteredLockedElementEntries = computed(() => lockedElementEntries.value.filter((entry) => locksCompiled.value.matcher(`${entry.target} ${entry.method}`)))
const changelogFromDate = ref('')
const changelogToDate = ref('')
const changelogEntries = [{ version: '0.1.0', date: '2026-08-22', changes: ['Guided MaterialPBX web interface and Windows desktop lab.', 'Plain-language one-click onboarding and visual PBX feature destinations.', 'Landing and documentation surface with an explicit non-runtime boundary.'], commit: '5147a896f8c65b863607378480d5fe46df04e31f' }]
const changelogCompiled = computed(() => compileSearch(changelogSearch))
const filteredChangelogEntries = computed(() => changelogEntries.filter((entry) => (!changelogFromDate.value || entry.date >= changelogFromDate.value) && (!changelogToDate.value || entry.date <= changelogToDate.value) && changelogCompiled.value.matcher(`${entry.version} ${entry.date} ${entry.changes.join(' ')}`)))
const docsCompiled = computed(() => compileSearch(docsSearch))
const documentationPages = computed(() => pages.filter((item) => !['docs', 'settings'].includes(item.id)))
const filteredDocumentationPages = computed(() => documentationPages.value.filter((item) => docsCompiled.value.matcher(`${item.label} ${item.description} ${item.group}`)))
const featureStatus = ref('All')
const featureCompiled = computed(() => compileSearch(featureSearch))
const filteredCurrentResources = computed(() => currentResources.value.filter((resource) => {
  if (!featureCompiled.value.matcher(`${resource.name} ${resource.summary ?? ''} ${resource.tags.join(' ')}`)) return false
  if (featureStatus.value === 'Enabled' && !resource.enabled) return false
  if (featureStatus.value === 'Disabled' && resource.enabled) return false
  if (featureStatus.value === 'Needs attention' && !resource.tags.some((tag) => /warning|attention|error/i.test(tag))) return false
  return true
}))
const siteDestinationOptions = ['Ring a group of phones', 'Send to a person', 'Open a phone menu', 'Take voicemail']

const paletteOpen = ref(false)
const tabActionItems: ActionChoice[] = [
  { id: 'search-strip', label: 'Search this tab strip…', description: 'Open the command palette for the current strip.' },
  { id: 'search-all', label: 'Search all tabs…', description: 'Search every open destination.' },
  { id: 'search-groups', label: 'Search groups…', description: 'Search tab groups by visible name.' },
  { id: 'close-containing', label: 'Close tabs containing text…', description: 'Unavailable until a review preview and pinned-tab protection are implemented.', disabled: true },
  { id: 'close-not-containing', label: 'Close tabs not containing text…', description: 'Unavailable until a review preview and pinned-tab protection are implemented.', disabled: true },
]
function runTabAction(id: string) {
  if (id === 'search-strip' || id === 'search-all' || id === 'search-groups') paletteOpen.value = true
}
const paletteCompiled = computed(() => compileSearch(paletteSearch))
const paletteResults = computed(() => pages.filter((item) => paletteCompiled.value.matcher(`${item.label} ${item.description} ${item.group}`)))
const siteHeaderMenuOpen = ref(false)
const siteHeaderMenuRegexOpen = ref(false)
const siteHeaderMenuSearch = reactive({ query: '', regex: false, flags: 'i' })
const siteHeaderMenuActivator = ref<unknown>(null)
const siteHeaderMenuCompiled = computed(() => {
  const flagError = validateRegexFlags(siteHeaderMenuSearch.regex, siteHeaderMenuSearch.flags)
  return flagError ? { matcher: () => false, error: flagError } : compileSearch(siteHeaderMenuSearch)
})
const siteHeaderMenuActions = [
  { id: 'how', label: 'How it works', description: 'Open the guided first-call walkthrough.', icon: siteIcons.rocket, run: () => openPage('onboarding') },
  { id: 'features', label: 'Features', description: 'Browse the complete product guide.', icon: siteIcons.feature, run: () => openPage('docs') },
  { id: 'notifications', label: 'Notifications', description: 'Review website messages and recovery actions.', icon: siteIcons.bell, run: () => openPage('notifications') },
  { id: 'palette', label: 'Command palette', description: 'Find every destination and setting. Shortcut: Ctrl Shift F.', icon: siteIcons.magnify, run: () => { paletteOpen.value = true } },
  { id: 'settings', label: 'Settings', description: 'Change this visitor’s language, appearance, and accessibility choices.', icon: siteIcons.cog, run: () => openPage('settings') },
]
const filteredSiteHeaderMenuActions = computed(() => siteHeaderMenuActions.filter((action) => siteHeaderMenuCompiled.value.matcher(`${action.label} ${action.description}`)))
function runSiteHeaderMenuAction(action: (typeof siteHeaderMenuActions)[number]) {
  const previousPage = activePage.value
  action.run()
  siteHeaderMenuOpen.value = false
  siteHeaderMenuSearch.query = ''
  if (activePage.value !== previousPage) window.requestAnimationFrame(() => focusDestination(activePage.value))
}
function focusFirstSiteHeaderMenuAction() {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#site-header-menu-actions .v-list-item')?.focus())
}
function onSiteHeaderMenuEscape() {
  if (siteHeaderMenuSearch.query) siteHeaderMenuSearch.query = ''
  else {
    siteHeaderMenuOpen.value = false
    nextTick(() => unwrapElement(siteHeaderMenuActivator.value)?.focus())
  }
}
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
const appearanceDraft = reactive({ weight: 400, underline: 'None', strikethrough: 'None', elevation: 0 })
const appearanceBaselineSnapshot = ref(JSON.stringify(appearanceDraft))
function editAppearance(target: string) { appearanceTarget.value = target; appearanceBaselineSnapshot.value = JSON.stringify(appearanceDraft); appearanceDialog.value = true }
function applyAppearanceDraft() {
  appearanceBaselineSnapshot.value = JSON.stringify(appearanceDraft)
  appearanceDialog.value = false
  recordHistory(`Changed appearance of ${appearanceTarget.value}`)
}
function discardAppearanceDraft() {
  Object.assign(appearanceDraft, JSON.parse(appearanceBaselineSnapshot.value))
  appearanceDialog.value = false
  notify('Appearance draft discarded', `The unapplied appearance choices for ${appearanceTarget.value} were discarded.`, 'info')
}

const settingsTab = ref('language')
function openSettingMatch(tab: string) {
  settingsTab.value = tab
  nextTick(() => {
    const heading = document.querySelector<HTMLElement>('.settings-window .v-window-item--active h2')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus()
  })
}
const lockWizardOpen = ref(false)
const lockTarget = ref('Current element')
const lockMethod = ref('Password stored as a local verifier')
const lockDuration = ref('This surface only')
const lockCredentialDraft = ref('')
const externalEditor = ref(localStorage.getItem('materialpbx.external-editor.v1') ?? 'Visual Studio Code (auto-detect)')
watch(externalEditor, (value) => localStorage.setItem('materialpbx.external-editor.v1', value))
const ticketDescription = ref('')
const ticketCategory = ref('Locked out')
const tickets = ref<Array<{ id: string; category: string; description: string; status: string }>>(JSON.parse(localStorage.getItem('materialpbx.tickets.v1') ?? '[]'))
function createTicket() {
  const ticket = { id: `LOCAL-${Date.now().toString(36).toUpperCase()}`, category: ticketCategory.value, description: ticketDescription.value || 'Open the local storage location for self-service reset.', status: 'Resolution ready' }
  tickets.value.unshift(ticket); localStorage.setItem('materialpbx.tickets.v1', JSON.stringify(tickets.value)); ticketDescription.value = ''; recordHistory(`Created local support ticket ${ticket.id}`)
}
function discardTicketDraft() {
  ticketDescription.value = ''
  ticketCategory.value = 'Locked out'
  notify('Ticket draft discarded', 'The unsaved local support-ticket form was reset.', 'info')
}
function cancelLockDraft() {
  lockCredentialDraft.value = ''
  lockWizardOpen.value = false
  notify('Toy-lock draft discarded', `The unsaved lock choices for ${lockTarget.value} were discarded.`, 'info')
}
function createToyLock() {
  lockedElementEntries.value.push({ target: lockTarget.value, method: lockMethod.value })
  localStorage.setItem('materialpbx.toy-locks.v1', JSON.stringify(lockedElementEntries.value))
  lockCredentialDraft.value = ''
  lockWizardOpen.value = false
  recordHistory(`Created a toy lock for ${lockTarget.value}`)
}
const scheduleRules = ref(JSON.parse(localStorage.getItem('materialpbx.schedule-rules.v1') ?? '[{"id":"work-hours","label":"Work hours","enabled":false,"days":["Mon","Tue","Wed","Thu","Fri"],"start":"09:00","end":"17:00","source":"Local settings"}]'))
watch(scheduleRules, (value) => localStorage.setItem('materialpbx.schedule-rules.v1', JSON.stringify(value)), { deep: true })
function addScheduleRule() { scheduleRules.value.push({ id: crypto.randomUUID(), label: `Schedule ${scheduleRules.value.length + 1}`, enabled: false, days: ['Mon','Tue','Wed','Thu','Fri'], start: '09:00', end: '17:00', source: 'Local settings' }); recordHistory('Added a scheduled settings rule') }
const customLogo = ref<string>(localStorage.getItem('materialpbx.custom-logo.v1') ?? '')
function loadLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return notify('Logo rejected', 'Choose a PNG, JPEG, WebP, or SVG under 2 MB.', 'error')
  const reader = new FileReader(); reader.onload = () => { customLogo.value = String(reader.result); localStorage.setItem('materialpbx.custom-logo.v1', customLogo.value); recordHistory('Changed application logo') }; reader.readAsDataURL(file)
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
const superConfirmReturnFocus = ref<HTMLElement | null>(null)
function openSuperConfirm(event?: Event) {
  superConfirmReturnFocus.value = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null
  superConfirmOpen.value = true
}
function cancelSuperConfirm() {
  superConfirmOpen.value = false
  Object.assign(confirmKeys, { one: false, two: false, slider: 0 })
  nextTick(() => superConfirmReturnFocus.value?.focus())
}
watch(superConfirmOpen, (open, previous) => {
  if (!open && previous) {
    Object.assign(confirmKeys, { one: false, two: false, slider: 0 })
    nextTick(() => superConfirmReturnFocus.value?.focus())
  }
})
function completeDestructiveAction() {
  if (!(confirmKeys.one && confirmKeys.two && confirmKeys.slider === 100)) return
  notify('Action authorized', 'The selected local draft was removed. No live PBX was changed.', 'success')
  recordHistory('Deleted a local draft after super confirmation')
  superConfirmOpen.value = false
  Object.assign(confirmKeys, { one: false, two: false, slider: 0 })
  nextTick(() => superConfirmReturnFocus.value?.focus())
}

const exportFormats = ['JSON', 'JSONL', 'YAML', 'TOML', 'XML', 'CSV', 'TSV', 'Markdown', 'HTML', 'SQL', 'TypeScript', 'Python', 'Go', 'Rust', 'JSON Schema', 'Protobuf']
const exportFormatActions = computed<ActionChoice[]>(() => exportFormats.map((format) => ({
  id: format,
  label: format,
  description: `Export the current filtered view as ${format}.`,
})))
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
function runExportFormat(format: string) { exportView(format) }
function exportOnboardingPlan() {
  const rows = [
    ['Purpose', 'Local planning checklist; this file does not configure a PBX.'],
    ['Phone system name', onboarding.serverName],
    ['Timezone', onboarding.timezone],
    ['Country or region', onboarding.country],
    ['First extension', String(onboarding.extensionStart)],
    ['Extension digits', String(onboarding.extensionDigits)],
    ['First phone type', onboarding.deviceType],
    ['Provider plan', onboarding.provider],
    ['Public phone number', onboarding.publicNumber || 'Not chosen'],
    ['Incoming calls ring', onboarding.inboundDestination],
    ['Outgoing call profile', onboarding.outboundProfile],
    ['Emergency number', onboarding.emergencyNumber],
    ['Emergency policy reviewed', onboarding.emergencyConfirmed ? 'Yes' : 'No'],
    ['NAT handling', onboarding.nat],
    ['Firewall profile', onboarding.firewall],
    ['TLS requested', onboarding.tls ? 'Yes' : 'No'],
    ['SRTP requested', onboarding.srtp ? 'Yes' : 'No'],
    ['Backup schedule', onboarding.backupSchedule],
    ['Normal test-call number', onboarding.testDestination || 'Not chosen'],
  ]
  const markdown = `# MaterialPBX planning checklist\n\n${rows.map(([label, value]) => `- **${label}:** ${value}`).join('\n')}\n`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'materialpbx-planning-checklist.md'; link.click(); URL.revokeObjectURL(link.href)
  recordHistory('Downloaded onboarding planning checklist')
  notify('Planning checklist downloaded', 'This local Markdown file is a plan only. Continue in the installed desktop lab connected to your own dedicated Debian 12 host to validate and apply it.', 'success')
}

const supportsDesktopVault = computed(() => props.surface === 'desktop')
interface DesktopUpdateSnapshot { state: string; version?: string; availableVersion?: string; message?: string }
interface DesktopBridge {
  window?: { minimize(): unknown; maximize(): unknown; close(): unknown }
  updates?: {
    status(): Promise<DesktopUpdateSnapshot>
    check(): Promise<DesktopUpdateSnapshot>
    install(request: { safeToRestart: boolean; unsavedWorkCount: number }): Promise<DesktopUpdateSnapshot>
    subscribe(listener: (state: DesktopUpdateSnapshot) => void): () => void
  }
}
const desktopBridge = () => (window as unknown as { materialPbxDesktop?: DesktopBridge }).materialPbxDesktop
const desktopWindow = () => desktopBridge()?.window
const desktopUpdate = ref<DesktopUpdateSnapshot>({ state: props.surface === 'desktop' ? 'idle' : 'unavailable', message: 'No update check has run yet.' })
const updateBannerDismissed = ref(false)
interface UnsavedWorkItem { id: string; label: string; route: string }
const unsavedWorkItems = computed<UnsavedWorkItem[]>(() => {
  if (props.surface !== 'desktop') return []
  const items: UnsavedWorkItem[] = []
  if (onboardingSnapshot() !== savedOnboardingSnapshot.value) items.push({ id: 'onboarding', label: 'Guided setup draft', route: 'Open Guided setup, then choose Save local draft or Discard changes.' })
  if (editorOpen.value && (editorIsNew.value || editorSnapshot() !== editorBaselineSnapshot.value)) items.push({ id: 'resource-editor', label: `${page.value.label} editor draft`, route: 'Return to the open editor and choose Save local draft or Cancel.' })
  if (appearanceDialog.value && JSON.stringify(appearanceDraft) !== appearanceBaselineSnapshot.value) items.push({ id: 'appearance', label: `Appearance draft for ${appearanceTarget.value}`, route: 'Return to the appearance editor and choose Apply to this element or Cancel.' })
  if (lockWizardOpen.value) items.push({ id: 'lock', label: `Toy-lock draft for ${lockTarget.value}`, route: 'Return to the lock wizard and choose Create toy lock or Cancel.' })
  if (ticketDescription.value.trim() || ticketCategory.value !== 'Locked out') items.push({ id: 'ticket', label: 'Local support-ticket draft', route: 'Open Support Tickets and choose Create local ticket or Discard draft.' })
  const savedEndpoint = localStorage.getItem('materialpbx.control-endpoint.v1') ?? ''
  if (connectDialog.value && (Boolean(serverCredential.value) || serverUrl.value !== savedEndpoint)) items.push({ id: 'connection', label: 'Connection preflight form', route: 'Return to the connection form and choose Run real preflight or Cancel.' })
  return items
})
const unsavedWorkCount = computed(() => unsavedWorkItems.value.length)
let stopUpdateSubscription: (() => void) | undefined
async function checkDesktopUpdate() {
  const updates = desktopBridge()?.updates
  if (!updates) return
  desktopUpdate.value = await updates.check()
  updateBannerDismissed.value = false
}
async function installDesktopUpdate() {
  const updates = desktopBridge()?.updates
  if (!updates) return
  if (unsavedWorkCount.value > 0) {
    const affected = unsavedWorkItems.value.map((item) => `${item.label}: ${item.route}`).join(' ')
    desktopUpdate.value = { ...desktopUpdate.value, state: 'ready', message: `Restart refused because ${unsavedWorkCount.value} unsaved ${unsavedWorkCount.value === 1 ? 'item is' : 'items are'} open. ${affected}` }
    notify('Restart refused while work is unsaved', affected, 'warning')
    return
  }
  desktopUpdate.value = await updates.install({ safeToRestart: true, unsavedWorkCount: unsavedWorkCount.value })
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  tabDockMedia = window.matchMedia('(max-width: 760px)')
  updateTabDockLayout()
  tabDockMedia.addEventListener('change', updateTabDockLayout)
  loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
  timer = window.setInterval(() => { elapsedSeconds.value += 1 }, 1000)
  maybeShowDimSum()
  const updates = desktopBridge()?.updates
  if (updates) {
    updates.status().then(state => { desktopUpdate.value = state })
    stopUpdateSubscription = updates.subscribe(state => {
      desktopUpdate.value = state
      if (state.state === 'ready' || state.state === 'failed') updateBannerDismissed.value = false
    })
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  tabDockMedia?.removeEventListener('change', updateTabDockLayout)
  window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
  window.clearInterval(timer)
  stopUpdateSubscription?.()
})
</script>

<template>
  <v-app :theme="settings.theme === 'system' ? undefined : settings.theme" class="materialpbx-app" :class="[{ 'low-stimulation': settings.adhdLowStim, 'reduced-motion': settings.reducedMotion, 'rainbow-accent': settings.rainbow, 'site-surface': props.surface === 'site' }, `density-${settings.density}`, `tab-dock-${effectiveTabDock}`]" :style="{ '--pbx-accent': settings.accent, '--pbx-font': settings.fontFamily, '--pbx-scale': settings.fontScale, '--rainbow-speed': `${[24,18,12,8,5][settings.rainbowSpeed-1]}s` }">
    <p class="visually-hidden" aria-live="polite" aria-atomic="true">{{ pageAnnouncement }}</p>
    <v-app-bar elevation="0" :class="['top-bar', { 'desktop-title-bar': props.surface === 'desktop', 'site-top-bar': props.surface === 'site' }]" @contextmenu.prevent="editAppearance('Top application bar')">
      <template #prepend>
        <v-avatar color="primary" rounded="lg"><v-img v-if="customLogo" :src="customLogo" alt="Custom MaterialPBX logo"/><span v-else aria-hidden="true">M</span></v-avatar>
      </template>
      <v-app-bar-title>{{ settings.appName }}</v-app-bar-title>
      <nav v-if="props.surface === 'site' && activePage === 'home'" class="site-top-actions" aria-label="Primary website navigation">
        <v-btn class="site-wide-action" variant="text" :prepend-icon="siteIcons.rocket" @click="openPage('onboarding')">How it works</v-btn>
        <v-btn class="site-wide-action" variant="text" :prepend-icon="siteIcons.feature" @click="openPage('docs')">Features</v-btn>
        <v-btn class="site-wide-action" variant="text" :prepend-icon="siteIcons.bell" @click="openPage('notifications')">Notifications</v-btn>
        <v-btn class="site-wide-action" variant="text" :prepend-icon="siteIcons.magnify" @click="paletteOpen = true">Command palette</v-btn>
        <v-btn class="site-wide-action" variant="text" :prepend-icon="siteIcons.cog" @click="openPage('settings')">Settings</v-btn>
        <v-btn class="site-get-app" color="primary" variant="flat" :prepend-icon="siteIcons.download" :href="installerDownloadUrl" target="_blank" rel="noopener" :aria-label="`Download latest published MaterialPBX ${latestPublishedVersion} desktop lab in a new tab`" :title="`Download latest published MaterialPBX ${latestPublishedVersion} desktop lab (opens in a new tab)`"><span class="site-get-app-label">Get app</span></v-btn>
        <v-menu v-model="siteHeaderMenuOpen" :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: menuProps }"><v-btn ref="siteHeaderMenuActivator" v-bind="menuProps" class="site-overflow-action" :icon="siteIcons.more" aria-label="More website actions" title="More website actions" /></template>
          <v-card class="site-overflow-menu" width="min(420px, calc(100vw - 24px))" role="navigation" aria-label="More website actions" @keydown.esc.stop="onSiteHeaderMenuEscape">
            <v-card-title>Website actions</v-card-title>
            <v-card-text>
              <div class="site-overflow-search">
                <v-text-field v-model="siteHeaderMenuSearch.query" autofocus label="Filter website actions" :prepend-inner-icon="siteIcons.magnify" hide-details clearable @keydown.down.prevent="focusFirstSiteHeaderMenuAction" />
                <v-btn :icon="siteIcons.regex" aria-label="Open regex builder for website actions menu" :color="siteHeaderMenuSearch.regex ? 'primary' : undefined" @click="siteHeaderMenuRegexOpen = !siteHeaderMenuRegexOpen" />
              </div>
              <v-expand-transition>
                <v-card v-if="siteHeaderMenuRegexOpen" class="site-overflow-regex" variant="tonal">
                  <v-switch v-model="siteHeaderMenuSearch.regex" label="Use regular expression" hide-details />
                  <v-text-field v-model="siteHeaderMenuSearch.flags" label="Flags" hint="Supported: g i m s u y" persistent-hint />
                  <p v-if="siteHeaderMenuCompiled.error" class="text-error" role="alert">{{ siteHeaderMenuCompiled.error }}</p>
                  <div class="builder-chips"><v-chip v-for="token in ['^ start', '$ end', '[abc] class', '(group)', 'a|b either', '+ one or more']" :key="token" size="small" @click="siteHeaderMenuSearch.query += token.split(' ')[0]">{{ token }}</v-chip></div>
                </v-card>
              </v-expand-transition>
              <p class="site-overflow-count" role="status" aria-live="polite">{{ filteredSiteHeaderMenuActions.length }} of {{ siteHeaderMenuActions.length }} actions shown</p>
              <v-list id="site-header-menu-actions" nav density="comfortable" aria-label="Filtered website actions">
                <v-list-item v-for="action in filteredSiteHeaderMenuActions" :key="action.id" :prepend-icon="action.icon" :title="action.label" :subtitle="action.description" @click="runSiteHeaderMenuAction(action)" />
                <v-list-item v-if="!filteredSiteHeaderMenuActions.length" :prepend-icon="siteIcons.information" title="No matching actions" subtitle="Clear the filter or correct the regular expression." />
              </v-list>
            </v-card-text>
          </v-card>
        </v-menu>
      </nav>
      <v-chip v-else :color="connectionColor" variant="tonal" :prepend-icon="connection === 'connected' ? 'mdi-lan-connect' : connection === 'connecting' ? 'mdi-progress-clock' : 'mdi-lan-disconnect'">{{ connectionLabel }}</v-chip>
      <template v-if="props.surface !== 'site' || activePage !== 'home'">
        <v-btn icon="mdi-bell-outline" aria-label="Open notifications" @click="openPage('notifications')" />
        <v-btn icon="mdi-magnify" aria-label="Open command palette, Ctrl Shift F" @click="paletteOpen = true" />
        <v-btn icon="mdi-cog-outline" aria-label="Open settings" @click="openPage('settings')" />
      </template>
      <template v-if="props.surface === 'desktop'">
        <v-btn class="window-control" icon="mdi-window-minimize" aria-label="Minimize window" @click="desktopWindow()?.minimize()" />
        <v-btn class="window-control" icon="mdi-window-maximize" aria-label="Maximize or restore window" @click="desktopWindow()?.maximize()" />
        <v-btn class="window-control close-window" icon="mdi-close" aria-label="Close window" @click="desktopWindow()?.close()" />
      </template>
    </v-app-bar>

    <v-navigation-drawer v-if="props.surface !== 'site' || activePage !== 'home'" :location="settings.dock === 'right' ? 'right' : 'left'" :rail="false" width="300" class="nav-drawer" @contextmenu.prevent="editAppearance('Navigation')">
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
      <div :class="['workspace-shell', { 'workspace-has-tabs': props.surface !== 'site' || activePage !== 'home' }]">
      <div v-if="props.surface !== 'site' || activePage !== 'home'" class="tab-strip" role="tablist" aria-label="Open pages" :aria-orientation="effectiveTabDock === 'left' || effectiveTabDock === 'right' ? 'vertical' : 'horizontal'">
        <div v-for="tab in openTabs" :key="tab" :class="['tab-item', { active: activePage === tab }]">
          <button :id="tabId(tab)" role="tab" :aria-selected="activePage === tab" :aria-controls="tabPanelId(tab)" :tabindex="tabFocusId === tab ? 0 : -1" class="tab-button" @focus="tabFocusId = tab" @keydown="onTabKeydown($event, tab)" @click="openPage(tab)" @contextmenu.prevent="editAppearance(`${pages.find(item => item.id === tab)?.label} tab`)" @click.middle="closeTab(tab)">
            <span>{{ pages.find(item => item.id === tab)?.label }}</span><span v-if="pinnedTabs.includes(tab)" aria-hidden="true">●</span><span v-if="pinnedTabs.includes(tab)" class="visually-hidden">Pinned tab</span>
          </button>
          <button v-if="!pinnedTabs.includes(tab)" class="tab-close-button" :aria-label="`Close ${pages.find(item => item.id === tab)?.label} tab`" @click="closeTab(tab)">×</button>
        </div>
        <SearchableActionMenu label="Tab actions" icon="mdi-dots-horizontal" :actions="tabActionItems" @activate="runTabAction" />
      </div>

      <v-container fluid class="content" :class="{ 'focus-mode': settings.adhdFocus }">
        <div v-for="tab in openTabs.filter((item) => item !== activePage)" :id="tabPanelId(tab)" :key="`${tab}-inactive-panel`" role="tabpanel" :aria-labelledby="tabId(tab)" hidden></div>
        <section ref="pagePanel" class="page-panel" role="tabpanel" :id="tabPanelId(activePage)" :aria-labelledby="props.surface === 'site' && activePage === 'home' ? undefined : tabId(activePage)" tabindex="-1">
        <v-alert v-if="props.surface === 'site' && activePage !== 'home'" type="info" variant="tonal" prominent class="mb-4" title="This is the MaterialPBX landing and documentation site">
          This site explains the product, provides documentation, status and settings for this visitor, and links verified downloads when they exist. It is not the primary phone-system application, does not control a PBX, and does not imitate a live PBX in the browser.
        </v-alert>
        <v-alert v-else-if="props.surface !== 'site'" :type="connectionColor as any" variant="tonal" prominent class="mb-4" :title="connectionLabel">
          {{ connectionMessage }}
          <template #append><div class="d-flex ga-2"><v-btn v-if="!['connected','degraded'].includes(connection)" variant="flat" @click="connectDialog = true">Connect a server</v-btn><v-btn v-else variant="text" @click="disconnectServer">Disconnect</v-btn></div></template>
        </v-alert>
        <v-alert v-if="props.surface === 'desktop' && !updateBannerDismissed && ['checking','downloading','ready','failed'].includes(desktopUpdate.state)" :type="desktopUpdate.state === 'failed' ? 'error' : desktopUpdate.state === 'ready' && unsavedWorkCount === 0 ? 'success' : 'info'" variant="tonal" class="mb-4 update-banner" :title="desktopUpdate.state === 'ready' ? `MaterialPBX ${desktopUpdate.availableVersion || 'update'} is ready` : desktopUpdate.state === 'failed' ? 'Update check failed' : desktopUpdate.state === 'downloading' ? 'Downloading an update' : 'Checking for updates'">
          <p>{{ desktopUpdate.message }} <span v-if="desktopUpdate.version">Current version: {{ desktopUpdate.version }}.</span> Updates are unsigned and verified with the HTTPS release feed plus the Squirrel package digest.</p>
          <section v-if="desktopUpdate.state === 'ready'" class="update-unsaved-status" aria-labelledby="update-unsaved-title">
            <strong id="update-unsaved-title" role="status" aria-live="polite">{{ unsavedWorkCount }} unsaved {{ unsavedWorkCount === 1 ? 'item' : 'items' }} must be resolved before restart.</strong>
            <ul v-if="unsavedWorkItems.length"><li v-for="item in unsavedWorkItems" :key="item.id"><strong>{{ item.label }}</strong> — {{ item.route }}</li></ul>
            <p v-else>There is no unsaved in-memory work. Restart can proceed.</p>
          </section>
          <template #append><div class="d-flex flex-wrap ga-2"><v-btn v-if="desktopUpdate.state === 'ready'" color="primary" :disabled="unsavedWorkCount > 0" :title="unsavedWorkCount > 0 ? 'Save or discard every listed item before restarting.' : 'Restart the desktop app and install the downloaded update.'" @click="installDesktopUpdate">Restart to install update</v-btn><v-btn v-if="desktopUpdate.state === 'failed'" variant="tonal" @click="checkDesktopUpdate">Retry</v-btn><v-btn variant="text" @click="updateBannerDismissed=true">Later</v-btn></div></template>
        </v-alert>

        <v-card v-if="settings.adhdOneThing" class="mb-4 pa-4" color="secondary-container" variant="flat"><v-text-field v-model="settings.nextAction" label="My one current next action" hint="This is chosen by you and stays after a restart." persistent-hint /></v-card>
        <v-card v-if="settings.adhdTime" class="mb-4 pa-3" variant="tonal">Session open: {{ Math.floor(elapsedSeconds/60) }} minutes · Last setting change: {{ Math.floor((Date.now()-lastChangedAt)/60000) }} minutes ago</v-card>

        <template v-if="activePage === 'home'">
          <template v-if="props.surface === 'site'">
            <section class="site-hero site-hero-v2" aria-labelledby="site-hero-title">
              <div class="site-hero-orb site-hero-orb-one" aria-hidden="true"></div>
              <div class="site-hero-orb site-hero-orb-two" aria-hidden="true"></div>
              <div class="site-hero-copy">
                <v-chip color="primary" variant="tonal" size="large" class="site-kicker"><v-icon :icon="siteIcons.phoneIncoming" start/>FreePBX + Asterisk, made visual</v-chip>
                <h1 id="site-hero-title">Your calls.<br><span>Drawn out,</span><br>not buried in forms.</h1>
                <p class="site-hero-lead">Build a real phone system by answering ordinary questions. MaterialPBX turns every route, queue, trunk, recording, and server connection into a visible decision you can understand before you apply it.</p>
                <div class="site-hero-actions">
                  <v-btn color="primary" size="x-large" rounded="xl" :prepend-icon="siteIcons.rocket" @click="openPage('onboarding')">Build my first call path</v-btn>
                  <v-btn variant="outlined" size="x-large" rounded="xl" :prepend-icon="siteIcons.book" @click="openPage('docs')">See the full toolbox</v-btn>
                </div>
                <div class="site-hero-trust" aria-label="Product principles">
                  <span><strong>Guided first</strong><small>No PBX knowledge assumed</small></span>
                  <span><strong>Expert when needed</strong><small>Asterisk depth stays available</small></span>
                  <span><strong>No nagging</strong><small>No promotional interruptions</small></span>
                </div>
                <p class="site-boundary-note"><v-icon :icon="siteIcons.information" aria-hidden="true"/> This public website teaches and documents only. Real PBX control requires the installed desktop lab connected to your own dedicated Debian 12 host.</p>
              </div>

              <section class="site-flow-studio" aria-labelledby="site-route-preview-title" aria-describedby="site-route-preview-boundary">
                <div class="site-studio-bar"><span class="site-studio-dots" aria-hidden="true"><i></i><i></i><i></i></span><strong id="site-route-preview-title">Call route simulation</strong><v-chip color="success" size="small" variant="tonal">Interactive example</v-chip></div>
                <p id="site-route-preview-boundary" class="site-simulation-boundary">Static simulation only. No live call, PBX connection, or phone number is being used.</p>
                <div class="site-studio-canvas">
                  <div class="site-studio-node incoming"><span class="site-node-icon" aria-hidden="true"><v-icon :icon="siteIcons.phoneIncoming"/></span><span><small>EXAMPLE CALL</small><strong>Fictional caller</strong></span><b class="site-live-pulse" aria-hidden="true"></b></div>
                  <div class="site-studio-line" aria-hidden="true"><i></i></div>
                  <div class="site-studio-node decision"><span class="site-node-icon" aria-hidden="true"><v-icon :icon="siteIcons.tune"/></span><span><small>{{ siteDemo.eyebrow }}</small><strong>{{ siteDemo.title }}</strong><em>{{ siteDemo.detail }}</em></span></div>
                  <div class="site-studio-line" aria-hidden="true"><i></i></div>
                  <div class="site-studio-node result" :data-mode="siteDemoMode" role="status" aria-live="polite" aria-atomic="true"><span class="site-node-icon" aria-hidden="true"><v-icon :icon="siteDemoMode === 'closed' ? siteIcons.voicemail : siteIcons.accountGroup"/></span><span><small>SIMULATED NEXT DESTINATION</small><strong>{{ siteDemo.result }}</strong><em>Every example outcome stays visible and editable.</em></span><v-icon :icon="siteIcons.chevron" aria-hidden="true"/></div>
                </div>
                <div class="site-studio-modes" role="group" aria-label="Choose a route condition">
                  <button v-for="mode in siteDemoModes" :key="mode.id" :class="{ active: siteDemoMode === mode.id }" :aria-pressed="siteDemoMode === mode.id" @click="siteDemoMode=mode.id"><span>{{ mode.label }}</span><small>{{ mode.id === 'open' ? 'Team answers' : mode.id === 'closed' ? 'Voicemail' : 'Fallback route' }}</small></button>
                </div>
              </section>
            </section>

            <section class="site-story-section" aria-labelledby="site-story-title">
              <div class="site-editorial-heading"><p class="eyebrow">START WITH WHAT YOU WANT TO HAPPEN</p><h2 id="site-story-title">A phone system should feel like arranging a conversation.</h2><p>A PBX is simply the private phone system for a home or organization. You choose the people, the timing, and the fallback; MaterialPBX translates those choices into bounded FreePBX and Asterisk configuration, then shows what happened.</p></div>
              <div class="site-bento">
                <article class="site-bento-card site-bento-guide">
                  <div><v-avatar color="primary" size="64"><v-icon :icon="siteIcons.sprout"/></v-avatar><p class="eyebrow">ONE-CLICK ONBOARDING</p><h3>From “what is a PBX?” to a reviewable first call.</h3><p>Every screen explains the term, recommends a safe starting point, and names what is still missing.</p></div>
                  <ol class="site-mini-steps"><li><span>1</span><div><strong>Name your phone system</strong><small>We suggest a friendly default.</small></div></li><li><span>2</span><div><strong>Choose who should ring</strong><small>People and phones are visual choices.</small></div></li><li><span>3</span><div><strong>Review the complete route</strong><small>Nothing hides behind “Apply.”</small></div></li></ol>
                  <v-btn color="primary" rounded="xl" @click="openPage('onboarding')">Try the guided plan</v-btn>
                </article>
                <article class="site-bento-card site-bento-hosted"><p class="eyebrow">SELF-HOST FOR REAL CALLS</p><h3>Run the production control service on your own dedicated Debian 12 host.</h3><p>The public documentation host never carries calls. Your Debian 12 host keeps Asterisk, FreePBX, secrets, media, and privileged operations inside boundaries you control.</p><v-btn variant="tonal" :prepend-icon="siteIcons.server" href="https://github.com/Ding-Ding-Projects/MaterialPBX/blob/main/docs/architecture/deployment.md" target="_blank" rel="noopener">Read self-hosting architecture</v-btn></article>
                <article class="site-bento-card site-bento-pair"><p class="eyebrow">PAIR TWO SERVERS</p><h3>Connect PBXs without pretending trust is automatic.</h3><p>Invitation-based pairing, narrow route scopes, fingerprints, expiry, revocation, and loop prevention make the relationship understandable.</p><v-btn variant="text" :append-icon="siteIcons.chevron" @click="openPage('paired-servers')">Explore server pairing</v-btn></article>
                <article class="site-bento-card site-bento-lab"><p class="eyebrow">DESKTOP LAB</p><h3>Learn and plan on Windows before touching production.</h3><p>The packaged desktop experience keeps the same guided controls, appearance system, offline help, and honest disconnected states.</p><v-btn variant="text" :append-icon="siteIcons.chevron" @click="openPage('desktop')">See the desktop workflow</v-btn></article>
              </div>
            </section>

            <section class="site-playground-section" aria-labelledby="site-playground-title">
              <div class="site-playground-copy"><p class="eyebrow">REAL CONTROLS, RIGHT HERE</p><h2 id="site-playground-title">Make a decision. See the sentence change.</h2><p>No pretend command line and no mystery text box. Choose a destination, adjust the ring time, and decide whether supported voice paths request encryption.</p><div class="site-playground-summary" role="status" aria-live="polite" aria-atomic="true"><v-icon :icon="siteIcons.message" aria-hidden="true"/><p><small>YOUR CURRENT PLAN</small><strong>{{ sitePreviewSummary }}</strong></p></div></div>
              <section class="site-control-preview site-control-preview-v2" aria-labelledby="site-playground-control-title">
                <div class="site-preview-header"><span><small>INCOMING ROUTE SIMULATION</small><strong id="site-playground-control-title">Where should this example call go?</strong></span><v-chip color="primary" variant="tonal">Local simulation</v-chip></div>
                <SearchablePicker v-model="sitePreview.destination" label="Incoming calls ring" :items="siteDestinationOptions" hint="This changes only the local call-route simulation." persistent-hint />
                <div class="site-range-control"><div><span>Ring time</span><strong>{{ sitePreview.ringSeconds }} seconds</strong></div><v-slider v-model="sitePreview.ringSeconds" min="5" max="120" step="5" thumb-label hide-details aria-label="Ring time in seconds"/></div>
                <div class="site-switch-row"><span><strong>Voice encryption</strong><small>Request it when both sides support it</small></span><v-switch v-model="sitePreview.encryptVoice" color="primary" hide-details aria-label="Encrypt voice when supported"/></div>
              </section>
            </section>

            <section class="site-feature-section site-feature-constellation" aria-labelledby="site-feature-title">
              <div class="site-section-heading"><div><p class="eyebrow">NOT A THIN RESKIN</p><h2 id="site-feature-title">The Asterisk toolbox, organized around human jobs.</h2><p>Every shipped product destination appears here. Open one to read what it does, its safe defaults, failure modes, and related guides.</p></div><v-btn variant="outlined" rounded="xl" :append-icon="siteIcons.chevron" @click="openPage('docs')">Search all documentation</v-btn></div>
              <div class="site-feature-groups">
                <section v-for="group in siteFeatureGroups" :key="group.group" class="site-feature-group" :aria-label="`${group.group} features`"><div class="site-feature-group-heading"><span>{{ group.group }}</span><small>{{ group.items.length }} destinations</small></div><div class="site-feature-cloud"><button v-for="item in group.items" :key="item.id" @click="openPage(item.id)"><v-icon :icon="siteIcons.feature" size="18"/><span>{{ item.label }}</span><v-icon :icon="siteIcons.chevron" size="16"/></button></div></section>
              </div>
            </section>

            <section class="site-proof-ribbon" aria-label="MaterialPBX product commitments"><div><strong>{{ productFeaturePages.length }}</strong><span>guided product destinations</span></div><div><strong>3</strong><span>language presentation modes</span></div><div><strong>2</strong><span>ways to run: desktop lab or self-hosted Debian 12</span></div><div><strong>0</strong><span>payment, review, or donation nags</span></div></section>

            <section class="site-download-section site-download-v2" aria-labelledby="site-download-title">
              <div class="site-download-glow" aria-hidden="true"></div><div><v-chip color="primary" variant="flat" class="mb-5">CANDIDATE {{ candidateVersion }} · NOT YET PUBLISHED</v-chip><p class="eyebrow">PUBLISHED LAB + SELF-HOSTING GUIDE</p><h2 id="site-download-title">Learn safely on the desktop.<br>Self-host calls on Debian 12.</h2><p>The latest verified, non-draft desktop-lab release is {{ latestPublishedVersion }}. The {{ candidateVersion }} redesign shown here is a candidate and is not yet a published installer. For real calls, deploy the production control service on your own dedicated Debian 12 host; this public documentation host is never the telephony runtime. The published Windows installer is intentionally unsigned, so Windows may show an unknown-publisher or SmartScreen warning.</p></div>
              <div class="site-download-actions"><v-btn color="primary" size="x-large" rounded="xl" :prepend-icon="siteIcons.windows" :href="installerDownloadUrl" target="_blank" rel="noopener">Download published {{ latestPublishedVersion }} lab</v-btn><v-btn variant="outlined" size="x-large" rounded="xl" :prepend-icon="siteIcons.github" href="https://github.com/Ding-Ding-Projects/MaterialPBX" target="_blank" rel="noopener">View source and self-hosting</v-btn></div>
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
              <v-stepper-window-item :value="1"><v-card flat class="step-card"><h2>Name and location</h2><p>The name helps you recognize this server. The timezone decides opening hours, reports, and voicemail dates.</p><v-text-field v-model="onboarding.serverName" label="Phone system name"/><SearchablePicker v-model="onboarding.timezone" label="Timezone" :items="[Intl.DateTimeFormat().resolvedOptions().timeZone,'America/Vancouver','America/New_York','Europe/London','Asia/Hong_Kong']"/><SearchablePicker v-model="onboarding.country" label="Country or region" :items="[{title:'Canada',value:'CA'},{title:'United States',value:'US'},{title:'Hong Kong',value:'HK'},{title:'United Kingdom',value:'GB'}]"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="2"><v-card flat class="step-card"><h2>People, extensions, and phones</h2><p>An extension is a short internal number such as 101. A device is the desk phone, computer app, or browser that rings for that extension.</p><v-slider v-model="onboarding.extensionDigits" :min="2" :max="6" step="1" label="Extension digits" thumb-label/><v-number-input v-model="onboarding.extensionStart" label="First extension number" :min="10" :max="999999"/><SearchablePicker v-model="onboarding.deviceType" label="First phone type" :items="[{title:'Softphone app (easiest to start)',value:'softphone'},{title:'Desk phone',value:'desk'},{title:'Browser calling',value:'browser'}]"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="3"><v-card flat class="step-card"><h2>Connect a phone company</h2><p>A trunk is the connection to a phone company or another PBX. It carries calls to and from public phone numbers.</p><SearchablePicker v-model="onboarding.provider" label="Provider plan" :items="['I will connect a phone company later','Generic SIP provider','Pair another FreePBX-compatible server']"/><v-text-field v-model="onboarding.publicNumber" label="Public phone number" hint="Optional. Include country code, such as +14165550100." persistent-hint/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="4"><v-card flat class="step-card"><h2>Choose where calls go</h2><p>An inbound route answers “what rings when someone calls this public number?” An outbound route chooses which trunk carries calls dialed by your phones. Emergency calls need a verified address and provider policy.</p><SearchablePicker v-model="onboarding.inboundDestination" label="Incoming calls ring" :items="['First extension','A group of phones','A phone menu','Voicemail']"/><SearchablePicker v-model="onboarding.outboundProfile" label="Outgoing call profile" :items="['Local and long distance','Internal only until verified','Custom expert rules']"/><v-text-field v-model="onboarding.emergencyNumber" label="Emergency number for this region"/><v-checkbox v-model="onboarding.emergencyConfirmed" label="I understand emergency calling must be verified with the phone company and tested using its approved procedure."/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="5"><v-card flat class="step-card"><h2>Network and call encryption</h2><p>NAT lets many devices share one internet address. A firewall limits who can contact the PBX. TLS protects call setup; SRTP protects the voice stream.</p><SearchablePicker v-model="onboarding.nat" label="NAT handling" :items="[{title:'Detect automatically (recommended)',value:'automatic'},{title:'No NAT; PBX has a public address',value:'none'},{title:'Expert manual mapping',value:'manual'}]"/><SearchablePicker v-model="onboarding.firewall" label="Firewall profile" :items="[{title:'Recommended: trusted networks plus phone company',value:'recommended'},{title:'Local network only',value:'local'},{title:'Expert custom policy',value:'custom'}]"/><v-switch v-model="onboarding.tls" label="Use TLS when supported"/><v-switch v-model="onboarding.srtp" label="Use SRTP when supported"/></v-card></v-stepper-window-item>
              <v-stepper-window-item :value="6"><v-card flat class="step-card"><h2>{{ props.surface === 'site' ? 'Review and take your plan with you' : 'Back up, validate, then apply' }}</h2><p>A backup makes recovery possible. Never test emergency calling without using your provider’s approved procedure.</p><SearchablePicker v-model="onboarding.backupSchedule" label="Automatic backup schedule" :items="['Every night','Every Sunday','Manual only']" no-data-text="No matching schedules"/><v-text-field v-model="onboarding.testDestination" label="Normal test-call number" hint="Use a phone you control. Do not enter an emergency number." persistent-hint/><v-alert v-if="props.surface === 'site'" type="info" variant="tonal">This public walkthrough creates a local planning checklist only. It does not connect to, validate, or configure a phone system. Download the checklist, then continue in the installed desktop lab connected to your own dedicated Debian 12 host.</v-alert><v-alert v-else type="warning" variant="tonal">This wizard is a local draft while disconnected. “Apply” stays disabled until the server connection, provider credentials, emergency policy, firewall, and backup destination validate successfully.</v-alert></v-card></v-stepper-window-item>
            </v-stepper-window>
            <v-stepper-actions :disabled="onboardingStep === 1 ? 'prev' : onboardingStep === 6 ? 'next' : false" @click:prev="onboardingStep--" @click:next="onboardingStep++" />
          </v-stepper>
          <div v-if="props.surface === 'site'" class="d-flex flex-wrap justify-end ga-3 mt-4"><v-btn variant="tonal" @click="onboardingStep=6">Review plan</v-btn><v-btn color="primary" :disabled="!onboarding.emergencyConfirmed" @click="exportOnboardingPlan">Download planning checklist</v-btn><v-btn variant="outlined" href="https://github.com/Ding-Ding-Projects/MaterialPBX/blob/main/docs/architecture/deployment.md" target="_blank" rel="noopener">Continue to deployment guide</v-btn></div><div v-else class="d-flex flex-wrap justify-end ga-3 mt-4"><v-btn variant="text" :disabled="onboardingSnapshot() === savedOnboardingSnapshot" @click="discardOnboardingChanges">Discard changes</v-btn><v-btn variant="tonal" @click="saveOnboardingDraft">Save local draft</v-btn><v-btn color="primary" :disabled="!['connected','degraded'].includes(connection) || !onboarding.emergencyConfirmed || !onboarding.testDestination" @click="validateOnboardingTest">Validate normal test destination</v-btn></div>
        </template>

        <template v-else-if="activePage === 'settings'">
          <p class="eyebrow">SETTINGS</p><h1>Make every surface work your way</h1>
          <div class="settings-search"><v-text-field v-model="settingsSearch.query" label="Search settings" prepend-inner-icon="mdi-magnify" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for settings search" :color="settingsSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Settings search', 'settings', $event)"/></div>
          <p class="search-result-count" role="status" aria-live="polite">{{ filteredSettingsEntries.length }} of {{ settingsEntries.length }} settings sections match</p><p v-if="settingsCompiled.error" class="text-error" role="alert">{{ settingsCompiled.error }}</p>
          <v-list v-if="settingsSearch.query || settingsSearch.regex" class="search-results" aria-label="Matching settings sections"><v-list-item v-for="entry in filteredSettingsEntries" :key="entry.tab" :title="entry.label" :subtitle="entry.description" @click="openSettingMatch(entry.tab)"/><v-list-item v-if="!filteredSettingsEntries.length" title="No matching settings" subtitle="Clear the search or correct the regular expression." disabled/></v-list>
          <v-tabs v-model="settingsTab" show-arrows><v-tab v-for="tab in ['language','appearance','accessibility','schedules','privacy','advanced']" :key="tab" :value="tab">{{ tab }}</v-tab></v-tabs>
          <v-window v-model="settingsTab" class="settings-window">
            <v-window-item value="language"><section><h2>Language and tone</h2><SearchablePicker v-if="!settings.schoolMode" v-model="settings.language" label="Language" :items="[{title:'English',value:'en'},{title:'Playful Hong Kong-style Cantonese',value:'zh-HK'},{title:'Bilingual',value:'bilingual'}]"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyEnglish" min="1" max="5" step="1" thumb-label label="English funny level"/><v-slider v-if="!settings.schoolMode" v-model="settings.funnyCantonese" min="1" max="5" step="1" thumb-label label="Cantonese funny level"/><p v-if="!settings.schoolMode">Both funny levels default to 5 and style every message, including warnings and errors. Facts and choices never change.</p><v-switch v-model="settings.dialogEmoji" label="Show emojis in dialogs and message boxes"/><v-divider/><v-switch v-model="settings.schoolMode" :label="settings.schoolName"/><v-text-field v-model="settings.schoolName" label="Name of this mode"/><p>While active, this mode uses English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum capabilities from user-facing surfaces. Turning it off requires the shared local unlock method.</p></section></v-window-item>
            <v-window-item value="appearance"><section><h2>Appearance</h2><SearchablePicker v-model="settings.theme" label="Theme" :items="['system','light','dark']"/><SearchablePicker v-model="settings.density" label="Density" :items="['comfortable','compact','spacious']"/><div class="color-grid"><v-color-picker v-model="settings.accent" mode="hexa" show-swatches/><div><v-text-field v-model="settings.accent" label="Accent HEX or HEX8"/><v-switch v-model="settings.rainbow" label="Animated rainbow color"/><v-slider v-if="settings.rainbow" v-model="settings.rainbowSpeed" min="1" max="5" step="1" label="Rainbow speed level" thumb-label/><p>Contrast against the current surface: {{ contrast }}:1</p><v-list density="compact"><v-list-item v-for="row in accentRepresentations" :key="row[0]" :title="row[0]" :subtitle="row[1]"/></v-list></div></div><v-text-field v-model="settings.fontFamily" label="Interface font family"/><v-slider v-model="settings.fontScale" min="0.8" max="1.6" step="0.05" label="Font size scale" thumb-label/><v-text-field v-model="settings.appName" label="Displayed application name" hint="This does not change package identity, data folders, installer identity, or update feeds." persistent-hint/><SearchablePicker v-model="settings.dock" label="Tab and navigation dock" :items="['left','right','top','bottom']"/><v-btn @click="editAppearance('Settings page')">Edit this page appearance…</v-btn><v-file-input label="Custom application logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="loadLogo"/></section></v-window-item>
            <v-window-item value="accessibility"><section><h2>Accessibility and attention accommodations</h2><v-switch v-model="settings.reducedMotion" label="Reduce motion"/><v-switch v-model="settings.adhdFocus" label="Focus: emphasize the current work"/><v-switch v-model="settings.adhdLowStim" label="Low stimulation: quieter color and motion"/><v-switch v-model="settings.adhdTime" label="Time awareness: show elapsed time"/><v-switch v-model="settings.adhdOneThing" label="One thing at a time: keep one chosen next action"/><v-switch v-model="settings.adhdMomentum" label="Momentum: offer a gentle dismissible prompt after inactivity"/><p>These are interface accommodations, not medical assessment or advice. Every mode is off by default and can be combined.</p><v-divider/><h3>Narrator</h3><v-switch v-model="settings.narrator" label="Narrate important events"/><SearchablePicker v-model="settings.narratorLanguage" label="Narrated language" :items="[{title:'English',value:'en'},{title:'Cantonese',value:'zh-HK'},{title:'Both, English then Cantonese',value:'both'}]"/><SearchablePicker v-model="settings.englishVoice" label="English voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>v.lang.startsWith('en')).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><SearchablePicker v-model="settings.cantoneseVoice" label="Cantonese voice" :items="[{title:'Choose automatically',value:''},...voices.filter(v=>/zh.*(HK|Hant)/i.test(v.lang)).map(v=>({title:`${v.name} · ${v.lang}${v.localService?'':' · network-backed'}`,value:v.voiceURI}))]"/><v-slider v-model="settings.speechRate" min="0.5" max="2" step="0.1" label="Speech rate"/><v-slider v-model="settings.speechPitch" min="0" max="2" step="0.1" label="Speech pitch"/><v-btn @click="narrate('MaterialPBX narrator preview. Your selected voice is ready.')">Preview voice</v-btn></section></v-window-item>
            <v-window-item value="schedules"><section><h2>Scheduled settings</h2><p>Rules use your local timezone. Cross-midnight rules continue into the next day. Later rules win when two enabled rules overlap.</p><v-card v-for="rule in scheduleRules" :key="rule.id" class="pa-4 mb-3"><v-switch v-model="rule.enabled" :label="rule.label"/><div class="schedule-grid"><SearchablePicker v-model="rule.days" label="Days" multiple chips :items="['Mon','Tue','Wed','Thu','Fri','Sat','Sun']"/><v-text-field v-model="rule.start" type="time" label="Start time"/><v-text-field v-model="rule.end" type="time" label="End time"/><SearchablePicker v-model="rule.source" label="Source" :items="['Local settings','Validated HTTPS API','Home Assistant boolean entity']"/></div></v-card><v-btn prepend-icon="mdi-plus" @click="addScheduleRule">Add rule</v-btn></section></v-window-item>
            <v-window-item value="privacy"><section><h2>Local privacy</h2><v-file-input v-if="!settings.schoolMode" label="Personal vocabulary JSON" accept="application/json" @change="loadVocabulary"/><p v-if="!settings.schoolMode">{{ vocabularyStatus }}</p><v-btn v-if="!settings.schoolMode" variant="tonal" @click="localStorage.removeItem('materialpbx.personal-vocabulary.v1'); vocabularyStatus='No personal vocabulary file loaded'">Clear personal vocabulary</v-btn><p>Personal vocabulary parsing and caching stay on this device and are excluded from exports, logs, analytics, crash reports, history, and synchronization.</p><v-divider/><h3>Local history</h3><p>Settings and user-managed records are appended to local history. Credentials and authenticator secrets are never stored as plaintext history.</p><v-btn @click="openPage('history')">Open history</v-btn></section></v-window-item>
            <v-window-item value="advanced"><section><h2>Advanced controls</h2><v-switch v-model="expertMode" label="Show expert PBX controls"/><p>Expert controls expose direct Asterisk concepts with explanations and safe defaults. Raw configuration is never the only path.</p><SearchablePicker v-model="externalEditor" label="External editor" :items="['Visual Studio Code (auto-detect)','Visual Studio Code Insiders','Choose an executable…']"/><v-btn disabled title="External-editor process launch is not connected in this build.">Open current export in Visual Studio Code</v-btn><v-divider/><h3 v-if="props.surface === 'desktop'">Desktop updates</h3><div v-if="props.surface === 'desktop'" class="d-flex flex-wrap align-center ga-3"><v-btn variant="tonal" @click="checkDesktopUpdate">Check for updates</v-btn><span>Current version: {{ desktopUpdate.version || 'not reported' }}. State: {{ desktopUpdate.state }}. {{ desktopUpdate.message }}</span></div><p v-if="props.surface === 'desktop'">The updater downloads in the background from the HTTPS Squirrel release feed. Installation waits until you choose Restart to install update. Releases are intentionally unsigned.</p><v-divider/><h3>Universal exclusions for this project</h3><p>The local Ollama suite manager and universal file converter are intentionally not included, by explicit project direction.</p></section></v-window-item>
          </v-window>
        </template>

        <template v-else-if="activePage === 'notifications'">
          <p class="eyebrow">NOTIFICATION CENTER</p><h1>Messages and recovery actions</h1><div class="toolbar"><v-btn @click="notices=[]">Dismiss all</v-btn><SearchableActionMenu label="Bulk export" :actions="exportFormatActions" @activate="runExportFormat" /></div><v-card v-for="notice in notices" :key="notice.id" class="pa-4 mb-3"><h3>{{ notice.title }}</h3><p>{{ notice.body }}</p><small>{{ notice.at }}</small></v-card><v-card v-if="!notices.length" class="pa-8 text-center">No notifications yet.</v-card>
        </template>

        <template v-else-if="activePage === 'history'">
          <p class="eyebrow">LOCAL HISTORY</p><h1>Review changes without rewriting the past</h1><div class="toolbar"><v-text-field v-model="historyFromDate" type="date" label="From date"/><SearchablePicker v-model="historyActions" label="Action" multiple chips :items="availableHistoryActions" no-data-text="No matching actions"/><v-text-field v-model="historySearch.query" label="Search history" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for history search" :color="historySearch.regex ? 'primary' : undefined" @click="openRegexBuilder('History search', 'history', $event)"/></div><p class="search-result-count" role="status" aria-live="polite">{{ filteredHistory.length }} of {{ history.length }} revisions shown</p><p v-if="historyCompiled.error" class="text-error" role="alert">{{ historyCompiled.error }}</p><v-timeline side="end"><v-timeline-item v-for="entry in filteredHistory" :key="entry.id" dot-color="primary"><strong>{{ entry.action }}</strong><p>{{ entry.at }}</p><v-btn variant="text" disabled title="This entry records an action but does not contain a restorable snapshot.">Restore as a new revision</v-btn></v-timeline-item></v-timeline><v-card v-if="!history.length" class="pa-8 text-center">No local revisions yet.</v-card><v-card v-else-if="!filteredHistory.length" class="pa-8 text-center">No revisions match the active date, action, and search filters.</v-card>
        </template>

        <template v-else-if="activePage === 'authenticator'">
          <p class="eyebrow">LOCAL AUTHENTICATOR</p><h1>Time-based codes without cloud sync</h1><v-alert :type="supportsDesktopVault ? 'info':'warning'" variant="tonal">{{ supportsDesktopVault ? 'The credential-vault registration adapter is not connected in this build, so account creation stays disabled.' : 'This browser surface cannot use the operating-system credential vault. Add and reveal codes only after the desktop adapter is implemented.' }}</v-alert><div class="toolbar"><v-text-field v-model="authenticatorSearch.query" label="Search issuer or account" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for authenticator search" :color="authenticatorSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Authenticator search', 'authenticator', $event)"/><v-btn color="primary" disabled title="Credential-vault registration is not connected in this build.">Add account</v-btn></div><p class="search-result-count" role="status">{{ filteredAuthenticatorEntries.length }} of {{ authenticatorEntries.length }} accounts shown</p><p v-if="authenticatorCompiled.error" class="text-error" role="alert">{{ authenticatorCompiled.error }}</p><v-card class="pa-8 text-center">{{ authenticatorEntries.length ? 'No accounts match the active search.' : 'No authenticator accounts registered.' }}</v-card>
        </template>

        <template v-else-if="activePage === 'locks'">
          <p class="eyebrow">OPTIONAL LOCAL SPEED BUMPS</p><h1>Toy locks for individual elements</h1><v-alert type="warning" variant="tonal">These locks are for fun and organization. They do not encrypt data, secure the PBX, or protect anything from another person using this computer.</v-alert><div class="toolbar"><v-text-field v-model="locksSearch.query" label="Search locked elements" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for lock search" :color="locksSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Toy-lock search', 'locks', $event)"/><v-btn color="primary" @click="lockTarget='Current page';lockWizardOpen=true">Lock an element…</v-btn></div><p class="search-result-count" role="status">{{ filteredLockedElementEntries.length }} of {{ lockedElementEntries.length }} locks shown</p><p v-if="locksCompiled.error" class="text-error" role="alert">{{ locksCompiled.error }}</p><v-card class="pa-8 text-center"><h2>{{ lockedElementEntries.length ? 'No locks match the active search' : 'No toy locks configured' }}</h2><p>Every lock has its own password or time-based code and its own duration. Clearing this visitor’s site storage or the desktop application-data folder resets all locks.</p><v-btn variant="tonal" @click="openPage('support')">Forgotten a lock? Open Support Tickets</v-btn></v-card>
        </template>

        <template v-else-if="activePage === 'support'">
          <p class="eyebrow">FICTIONAL LOCAL SUPPORT DESK</p><h1>Support Tickets</h1><v-alert type="info" variant="tonal">Nothing is sent anywhere. No ticket exists outside this device, no network request is made, no data is collected, and nobody is reading it.</v-alert><div class="toolbar"><SearchablePicker v-model="ticketCategory" label="Category" :items="['Locked out','Cannot find a setting','Something else']" no-data-text="No matching categories"/><v-text-field v-model="ticketDescription" label="Description"/><v-btn v-if="ticketDescription.trim() || ticketCategory !== 'Locked out'" variant="text" @click="discardTicketDraft">Discard draft</v-btn><v-btn color="primary" @click="createTicket">Create local ticket</v-btn></div><v-card v-for="ticket in tickets" :key="ticket.id" class="pa-5 mb-3"><div class="d-flex justify-space-between"><strong>{{ ticket.id }}</strong><v-chip>{{ ticket.status }}</v-chip></div><p>{{ ticket.category }} · {{ ticket.description }}</p><p>Resolution: clear this visitor’s browser storage, or open the MaterialPBX application-data folder from the desktop app and delete it yourself. This interface never deletes it for you.</p></v-card><v-card v-if="!tickets.length" class="pa-8 text-center">No local tickets yet.</v-card>
        </template>

        <template v-else-if="activePage === 'changelog'">
          <p class="eyebrow">RELEASE HISTORY</p><h1>Changelog</h1><div class="toolbar"><v-text-field v-model="changelogFromDate" type="date" label="From date"/><v-text-field v-model="changelogToDate" type="date" label="To date"/><v-text-field v-model="changelogSearch.query" label="Search changes" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for changelog search" :color="changelogSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Changelog search', 'changelog', $event)"/><v-btn @click="exportView('Markdown')">Export filtered view</v-btn></div><p class="search-result-count" role="status">{{ filteredChangelogEntries.length }} of {{ changelogEntries.length }} releases shown</p><p v-if="changelogCompiled.error" class="text-error" role="alert">{{ changelogCompiled.error }}</p><v-card v-for="entry in filteredChangelogEntries" :key="entry.version" class="pa-6"><div class="d-flex justify-space-between"><h2>{{ entry.version }}</h2><time :datetime="entry.date">{{ entry.date }}</time></div><h3>Added</h3><ul><li v-for="change in entry.changes" :key="change">{{ change }}</li></ul><p><a :href="`https://github.com/Ding-Ding-Projects/MaterialPBX/commit/${entry.commit}`" target="_blank" rel="noopener">Source commit {{ entry.commit.slice(0, 7) }}</a></p></v-card><v-card v-if="!filteredChangelogEntries.length" class="pa-8 text-center">No released versions match the active date and search filters.</v-card>
        </template>

        <template v-else-if="activePage === 'docs'">
          <p class="eyebrow">OFFLINE GUIDE</p><h1>Every feature, explained in plain language</h1><div class="toolbar"><v-text-field v-model="docsSearch.query" label="Search titles and article text" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for documentation search" :color="docsSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Documentation search', 'docs', $event)"/></div><p class="search-result-count" role="status">{{ filteredDocumentationPages.length }} of {{ documentationPages.length }} articles shown</p><p v-if="docsCompiled.error" class="text-error" role="alert">{{ docsCompiled.error }}</p><div class="task-grid"><v-card v-for="item in filteredDocumentationPages" :key="item.id" class="pa-5 task-card"><h3>{{ item.label }}</h3><p>{{ item.description }}</p><v-btn variant="text" @click="openPage(item.id)">Open feature</v-btn></v-card></div><v-card v-if="!filteredDocumentationPages.length" class="pa-8 text-center">No documentation articles match the active search.</v-card>
        </template>

        <template v-else-if="visualFeature">
          <section class="feature-hero">
            <div class="feature-symbol" aria-hidden="true">{{ visualFeature.icon }}</div>
            <div><p class="eyebrow">{{ visualFeature.eyebrow }}</p><h1>{{ page.label }}</h1><p class="feature-lead">{{ visualFeature.lead }}</p><p class="safe-default"><strong>Safe starting point:</strong> {{ visualFeature.default }}</p></div>
            <div v-if="props.surface === 'site'" class="feature-actions"><v-btn variant="tonal" :prepend-icon="siteIcons.book" @click="openPage('docs')">Browse all guides</v-btn><v-btn color="primary" :prepend-icon="siteIcons.download" :href="installerDownloadUrl" target="_blank" rel="noopener">Get published {{ latestPublishedVersion }} lab</v-btn></div>
            <div v-else class="feature-actions"><v-btn variant="tonal" :loading="resourceLoading" :disabled="!['connected','degraded'].includes(connection)" @click="loadResources(activePage as PbxResourceKind)">Refresh live data</v-btn><v-btn color="primary" :disabled="!canAttemptWriteCurrent" :title="!canAttemptWriteCurrent ? 'A prior write request was refused for this feature.' : 'Write permission is confirmed only after the server accepts a save.'" @click="openResourceEditor()">{{ activePage === 'observability' ? 'Configure view' : 'Create' }}</v-btn></div>
          </section>
          <div v-if="props.surface === 'site'" class="feature-metrics">
            <v-card class="pa-5"><span>What this page does</span><strong>Explains</strong><small>Definitions, the safe starting point, and how this capability fits into a call path.</small></v-card>
            <v-card class="pa-5"><span>What this page never does</span><strong>No live changes</strong><small>The public website never connects to, reads from, or writes to a PBX.</small></v-card>
            <v-card class="pa-5"><span>Where real controls run</span><strong>Installed + self-hosted</strong><small>Use the installed desktop lab with your own dedicated Debian 12 production host.</small></v-card>
          </div>
          <div v-else class="feature-metrics">
            <v-card class="pa-5"><span>Live records</span><strong>{{ ['connected','degraded'].includes(connection) ? currentResources.filter(item => item.provenance !== 'local-draft').length : '—' }}</strong><small>{{ ['connected','degraded'].includes(connection) ? currentAccess === 'denied' ? 'Resource request was refused' : 'Returned by this server; local drafts are labelled separately' : 'Connect to load real records' }}</small></v-card>
            <v-card class="pa-5"><span>Observed access</span><strong>{{ currentAccess === 'write' ? 'Write confirmed' : currentAccess === 'read-only' ? 'Read only' : currentAccess === 'denied' ? 'Refused' : currentAccess === 'read' ? 'Read confirmed' : 'Not checked' }}</strong><small>The capability registry is evidence, not authorization. Access changes only after a real resource response.</small></v-card>
            <v-card class="pa-5"><span>PBX health</span><strong>{{ connectionLabel }}</strong><small>{{ healthSnapshot?.warnings[0] ?? connectionMessage }}</small></v-card>
          </div>
          <section v-if="activePage === 'ivrs'" class="call-flow-canvas" aria-label="Phone menu call-flow canvas">
            <article class="flow-node start"><span>1</span><div><strong>Greeting</strong><small>Play one verified recording</small></div></article><div class="flow-line">Callers choose</div>
            <div class="flow-branches"><article v-for="branch in [{key:'0',label:'Operator'},{key:'1',label:'Sales queue'},{key:'2',label:'Support queue'},{key:'…',label:'Invalid or timeout'}]" :key="branch.key" class="flow-node"><span>{{ branch.key }}</span><div><strong>{{ branch.label }}</strong><small>Choose a verified destination in the editor</small></div></article></div>
          </section>
          <div class="toolbar"><v-text-field v-model="featureSearch.query" :label="`Search ${page.label}`" prepend-inner-icon="mdi-magnify" clearable/><v-btn icon="mdi-regex" :aria-label="`Open regex builder for ${page.label} search`" :color="featureSearch.regex ? 'primary' : undefined" @click="openRegexBuilder(`${page.label} search`, 'feature', $event)"/><SearchablePicker v-model="featureStatus" label="Status" :items="['All','Enabled','Disabled','Needs attention']" no-data-text="No matching statuses"/><v-btn @click="exportView('JSON')">Export</v-btn><v-btn color="error" variant="tonal" @click="openSuperConfirm($event)">Delete local draft…</v-btn></div><p class="search-result-count" role="status">{{ filteredCurrentResources.length }} of {{ currentResources.length }} records shown</p><p v-if="featureCompiled.error" class="text-error" role="alert">{{ featureCompiled.error }}</p>
          <div class="control-room-grid" :aria-busy="resourceLoading">
            <v-card v-for="resource in filteredCurrentResources" :key="`${resource.provenance ?? 'server'}:${resource.id}`" class="resource-card pa-5"><div class="resource-card-title"><div><h2>{{ resource.name }}</h2><p>{{ resource.summary || page.description }}</p></div><v-switch :model-value="resource.enabled" hide-details :label="`${resource.name} accepts calls`" :disabled="!canAttemptWriteCurrent" @update:model-value="stageResourceEnabled(resource, $event)"/></div><div class="resource-tags"><v-chip v-if="resource.provenance === 'local-draft'" size="small" color="warning" variant="tonal">Local draft · not sent</v-chip><v-chip v-for="tag in resource.tags" :key="tag" size="small">{{ tag }}</v-chip><v-chip size="small" variant="outlined">Updated {{ resource.updatedAt || 'time not reported' }}</v-chip></div><v-btn variant="text" :disabled="!canAttemptWriteCurrent" @click="openResourceEditor(resource)">{{ resource.provenance === 'local-draft' && ['connected','degraded'].includes(connection) ? 'Review and send draft' : 'Open visual editor' }}</v-btn></v-card>
            <v-card v-if="!currentResources.length" class="feature-empty pa-8"><div class="empty-icon">{{ visualFeature.icon }}</div><h2>{{ props.surface === 'site' ? 'Understand the feature before configuring it' : currentAccess === 'denied' ? 'Resource permission refused' : ['connected','degraded'].includes(connection) ? 'No records returned for this feature' : 'Connect to load real PBX records' }}</h2><p>{{ props.surface === 'site' ? 'This guide explains what the installed controls and self-hosted Debian 12 service do, what a safe starting point looks like, and which related feature to learn next. It never shows fake live records.' : currentAccess === 'denied' ? 'The authenticated resource request returned a permission refusal. Ask an administrator for the narrow resource permission and retry.' : ['connected','degraded'].includes(connection) ? 'The control service returned an empty list. MaterialPBX does not insert sample live data.' : 'You can review the guided controls and save a local draft. Nothing will be presented as live until preflight succeeds.' }}</p><v-btn v-if="props.surface !== 'site' && !['connected','degraded'].includes(connection)" color="primary" @click="connectDialog=true">Connect a server</v-btn><v-btn v-else-if="props.surface !== 'site' && canAttemptWriteCurrent" color="primary" @click="openResourceEditor()">Create the first item</v-btn><v-btn v-else-if="props.surface === 'site'" variant="tonal" @click="openPage('docs')">Find related guides</v-btn></v-card><v-card v-else-if="!filteredCurrentResources.length" class="feature-empty pa-8"><h2>No records match the active search and status filter</h2><p>Clear the search, choose All statuses, or correct the regular expression.</p></v-card>
          </div>
        </template>

        <template v-else>
          <div class="headline-row"><div><p class="eyebrow">{{ page.group.toUpperCase() }}</p><h1>{{ page.label }}</h1><p>{{ page.description }}</p></div><div class="d-flex ga-2"><v-btn variant="tonal" @click="expertMode=!expertMode">{{ expertMode ? 'Guided view' : 'Expert view' }}</v-btn><v-btn v-if="props.surface !== 'site'" color="primary" prepend-icon="mdi-plus" @click="openResourceEditor()">Create</v-btn></div></div>
          <v-alert v-if="expertMode" type="info" variant="tonal" class="mb-4">Expert view names the Asterisk and FreePBX concepts behind each control. Values still use typed pickers, switches, ranges, and validated fields instead of raw configuration text.</v-alert>
          <div class="toolbar"><v-text-field v-model="featureSearch.query" :label="`Search ${page.label}`" prepend-inner-icon="mdi-magnify" clearable/><v-btn icon="mdi-regex" :aria-label="`Open regex builder for ${page.label} search`" :color="featureSearch.regex ? 'primary' : undefined" @click="openRegexBuilder(`${page.label} search`, 'feature', $event)"/><SearchablePicker v-model="featureStatus" label="Status" :items="['All','Enabled','Disabled','Needs attention']" no-data-text="No matching statuses"/><v-btn @click="exportView('JSON')">Export</v-btn><v-btn color="error" variant="tonal" @click="openSuperConfirm($event)">Delete local draft…</v-btn></div><p class="search-result-count" role="status">{{ filteredCurrentResources.length }} of {{ currentResources.length }} records shown</p><p v-if="featureCompiled.error" class="text-error" role="alert">{{ featureCompiled.error }}</p>
          <v-card class="empty-state pa-10 text-center"><div class="empty-icon">{{ page.icon }}</div><h2>{{ props.surface === 'site' ? 'Product feature guide' : `No ${page.label.toLowerCase()} loaded` }}</h2><p>{{ props.surface === 'site' ? 'This documentation surface explains the control without presenting sample live PBX records.' : ['connected','degraded'].includes(connection) ? 'The server returned no records or did not grant read permission. MaterialPBX never inserts fake live data.' : 'Connect a PBX to load real records, or create a local draft now. Nothing will be applied while offline.' }}</p><v-btn v-if="props.surface !== 'site'" color="primary" @click="openResourceEditor()">Create local draft</v-btn></v-card>
        </template>
        </section>
      </v-container>
      </div>
    </v-main>

    <v-dialog v-model="connectDialog" max-width="720"><v-card><v-card-title>Connect a PBX control service</v-card-title><v-card-text><p>Enter the HTTPS address and an admin credential for this session. Only the successful non-secret endpoint is saved locally. The credential stays in memory, is removed from this form immediately, and is discarded on disconnect or reload.</p><v-text-field v-model="serverUrl" label="Control-service address" type="url" placeholder="https://pbx.example.com" hint="Use HTTPS. HTTP is accepted only for localhost development." persistent-hint/><v-text-field v-model="serverCredential" label="Admin credential for this session" type="password" autocomplete="off" hint="Sent as an Authorization bearer credential. Never stored in settings, logs, history, or exports." persistent-hint/><v-alert :type="connection === 'permission-denied' ? 'warning' : ['offline','incompatible'].includes(connection) ? 'error' : 'info'" variant="tonal"><strong>{{ connectionLabel }}</strong><p>{{ connectionMessage }}</p></v-alert><div class="preflight-list"><div><v-icon icon="mdi-shield-check-outline"/><span>Public health at <code>/healthz</code></span></div><div><v-icon icon="mdi-api"/><span>Evidence registry schema and warnings</span></div><div><v-icon icon="mdi-account-key-outline"/><span>Authenticated system status</span></div><div><v-icon icon="mdi-phone-check-outline"/><span>Runtime-probed adapters and identity</span></div></div><p v-if="connection === 'permission-denied'">Recovery: enter a permitted admin credential and run preflight again. The capability registry describes evidence; it does not grant authorization.</p><p v-else-if="connection === 'offline'">Recovery: verify the address, trusted certificate, service process, firewall, and network route, then retry.</p><p v-else-if="connection === 'incompatible'">Recovery: correct the endpoint or update the MaterialPBX control service to a compatible API version.</p></v-card-text><v-card-actions><v-btn variant="text" :disabled="!serverUrl" @click="clearSavedEndpoint">Clear saved endpoint</v-btn><v-spacer/><v-btn @click="connectDialog=false;serverCredential=''">Cancel</v-btn><v-btn color="primary" :loading="connection === 'connecting'" :disabled="!serverUrl.trim() || !serverCredential" @click="runPreflight">Run real preflight</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog :model-value="editorOpen" :max-width="activePage === 'conferences' ? 920 : 760" @update:model-value="requestEditorClose">
      <v-card>
        <v-card-title>{{ editingResourceId ? 'Edit' : 'Create' }} {{ page.label }}</v-card-title>
        <v-card-subtitle>{{ page.description }}</v-card-subtitle>
        <v-card-text>
          <section v-if="activePage === 'conferences'" class="conference-editor" aria-label="Guided conference room settings">
            <v-alert v-if="editorIsNew" type="info" variant="tonal" title="Visible starting values">
              A new room starts at number 700 with a 20-person cap. Recording, recorded-name announcements, start muted, waiting music, and quiet mode all start off. The cap is a MaterialPBX suggestion because Asterisk’s own unlimited default is outside this guided 2–200 range.
            </v-alert>
            <v-alert v-if="editingResourceProvenance === 'local-draft'" type="warning" variant="tonal" title="Local draft · review before sending">
              This versioned draft came from local browser storage and has not been sent to a PBX. Connecting does not merge or apply it. Review every value, then choose Review and send to control service explicitly.
            </v-alert>

            <section v-if="editorIsNew" class="conference-presets" aria-labelledby="conference-presets-heading">
              <div><h2 id="conference-presets-heading">Start from a preset</h2><p>Each preset changes the real controls below. You can adjust every value before saving.</p></div>
              <div class="conference-preset-actions">
                <v-btn variant="tonal" @click="applyConferencePreset('small')">Small conversation · 6</v-btn>
                <v-btn variant="tonal" @click="applyConferencePreset('team')">Team meeting · 20</v-btn>
                <v-btn variant="tonal" @click="applyConferencePreset('event')">Quiet event · 100</v-btn>
              </div>
            </section>

            <section class="conference-section" aria-labelledby="conference-room-heading">
              <div class="conference-section-copy"><p class="conference-kicker">ROOM SETTINGS</p><h2 id="conference-room-heading">How people reach the room</h2><p>These values belong to the shared room rather than to one caller.</p></div>
              <v-text-field ref="conferenceRoomNameInput" v-model="editorValues.name" data-conference-field="roomName" label="Room name" maxlength="80" counter="80" :error-messages="conferenceErrorMessages('roomName')" hint="Use 1 to 80 characters. This label helps operators recognize the room; callers dial the number below." persistent-hint />
              <v-switch v-model="editorValues.enabled" data-conference-field="enabled" color="primary" label="Accept calls" :error-messages="conferenceErrorMessages('enabled')" hint="Turn this off to keep the room definition without accepting callers. The change is applied only when you save." persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.enabled === true ? 'On' : editorValues.enabled === false ? 'Off' : 'Choose on or off' }}</v-chip></template>
              </v-switch>
              <div ref="conferenceNumberControl" class="conference-number-control" role="group" aria-label="Conference number dial pad" aria-describedby="conference-number-help conference-number-error">
                <div class="conference-number-display"><span>Conference number</span><output aria-live="polite">{{ String(editorValues.number ?? '') || 'No digits yet' }}</output><small id="conference-number-help">Use 2 to 12 digits. People dial this number to enter the room.</small><p v-if="conferenceErrorMessages('number').length" id="conference-number-error" class="text-error" role="alert">{{ conferenceErrorMessages('number').join(' ') }}</p></div>
                <div class="conference-dial-pad">
                  <v-btn v-for="digit in [1,2,3,4,5,6,7,8,9,0]" :key="digit" variant="tonal" :aria-label="`Add digit ${digit} to conference number`" :disabled="String(editorValues.number ?? '').length >= 12" @click="enterConferenceDigit(digit)">{{ digit }}</v-btn>
                  <v-btn variant="outlined" :disabled="!String(editorValues.number ?? '')" @click="backspaceConferenceDigit">Backspace</v-btn>
                  <v-btn variant="text" :disabled="!String(editorValues.number ?? '')" @click="editorValues.number = ''">Clear</v-btn>
                </div>
              </div>
              <div class="conference-capacity-control">
                <div><label for="conference-capacity-slider">Maximum participants</label><p>FreePBX refuses additional callers after this whole-number limit.</p></div>
                <v-number-input ref="conferenceCapacityInput" v-model="editorValues.maxParticipants" aria-label="Maximum participants stepper" :min="2" :max="200" :step="1" control-variant="split" :error-messages="conferenceErrorMessages('maxParticipants')" />
                <v-slider id="conference-capacity-slider" v-model="editorValues.maxParticipants" :min="2" :max="200" :step="1" thumb-label="always" aria-label="Maximum participants slider" />
              </div>
              <v-switch v-model="editorValues.recordConference" data-conference-field="recordConference" color="primary" label="Record the conference" :error-messages="conferenceErrorMessages('recordConference')" :hint="editorIsNew ? 'Off by default. When on, FreePBX starts recording when the first active participant enters and stops after the last leaves.' : 'When on, FreePBX starts recording when the first active participant enters and stops after the last leaves.'" persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.recordConference ? 'On' : editorIsNew ? 'Off · default' : 'Off' }}</v-chip></template>
              </v-switch>
              <v-alert v-if="editorValues.recordConference" type="warning" variant="tonal" title="Recording needs an operating policy">
                Files go to the PBX recording store. Retention, access, and export are separate operator choices. Follow every notice and consent rule that applies where callers are located.
              </v-alert>
            </section>

            <section class="conference-section" aria-labelledby="conference-participant-heading">
              <div class="conference-section-copy"><p class="conference-kicker">PARTICIPANT SETTINGS</p><h2 id="conference-participant-heading">What each joining caller experiences</h2><p>FreePBX applies these options to each ordinary participant as they enter.</p></div>
              <v-switch v-model="editorValues.announceJoinLeave" data-conference-field="announceJoinLeave" color="primary" label="Announce who joins and leaves" :error-messages="conferenceErrorMessages('announceJoinLeave')" :hint="editorIsNew ? 'Off by default. When on, each caller records their name, and FreePBX plays that recorded name when they join or leave.' : 'When on, each caller records their name, and FreePBX plays that recorded name when they join or leave.'" persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.announceJoinLeave ? 'On' : editorIsNew ? 'Off · default' : 'Off' }}</v-chip></template>
              </v-switch>
              <v-switch v-model="editorValues.startMuted" data-conference-field="startMuted" color="primary" label="Start each participant muted" :error-messages="conferenceErrorMessages('startMuted')" :hint="editorIsNew ? 'Off by default. When on, callers can press *1 in the FreePBX user menu to toggle mute and speak.' : 'When on, callers can press *1 in the FreePBX user menu to toggle mute and speak.'" persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.startMuted ? 'On · *1 unmutes' : editorIsNew ? 'Off · default' : 'Off' }}</v-chip></template>
              </v-switch>
              <v-switch v-model="editorValues.musicOnHoldWhenEmpty" data-conference-field="musicOnHoldWhenEmpty" color="primary" label="Play waiting music while a caller is alone" :error-messages="conferenceErrorMessages('musicOnHoldWhenEmpty')" :hint="editorIsNew ? 'Off by default. When on, FreePBX requests the PBX default music class while a caller is alone or waiting. Configuration success does not prove audio is available; verify it with a real call.' : 'When on, FreePBX requests the PBX default music class while a caller is alone or waiting. Configuration success does not prove audio is available; verify it with a real call.'" persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.musicOnHoldWhenEmpty ? 'On' : editorIsNew ? 'Off · default' : 'Off' }}</v-chip></template>
              </v-switch>
              <v-switch v-model="editorValues.quiet" data-conference-field="quiet" color="primary" label="Quiet mode" :error-messages="conferenceErrorMessages('quiet')" :hint="editorIsNew ? 'Off by default. When on, FreePBX suppresses entry, exit, and recorded-name announcements for each caller.' : 'When on, FreePBX suppresses entry, exit, and recorded-name announcements for each caller.'" persistent-hint>
                <template #append><v-chip size="small" variant="outlined">{{ editorValues.quiet ? 'On' : editorIsNew ? 'Off · default' : 'Off' }}</v-chip></template>
              </v-switch>
            </section>

            <v-alert v-for="message in conferenceErrors" :key="message" type="error" variant="tonal" :text="message" role="alert" />
            <section class="conference-review" aria-labelledby="conference-review-heading">
              <div><p class="conference-kicker">REVIEW</p><h2 id="conference-review-heading">What will be applied</h2><p>This summary is generated from the same values sent to the typed control service.</p></div>
              <div class="conference-review-chips"><v-chip v-for="item in conferenceReview" :key="item" variant="tonal">{{ item }}</v-chip></div>
            </section>
            <v-expansion-panels v-if="!conferenceErrors.length" variant="accordion" class="conference-advanced">
              <v-expansion-panel title="Advanced native behavior (validated)">
                <v-expansion-panel-text>
                  MaterialPBX uses the installed FreePBX Conferences module. FreePBX owns the ext-meetme dialplan and dynamic ConfBridge profiles. Option s always supplies the standard user menu, where *1 toggles mute. No PIN, moderator role, arbitrary dialplan, shell command, or free-form configuration is accepted.
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </section>

          <template v-else v-for="field in currentForm" :key="field.key">
            <v-text-field v-if="field.type==='text'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/>
            <v-number-input v-else-if="field.type==='number'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/>
            <SearchablePicker v-else-if="field.type==='select'" v-model="editorValues[field.key]" :label="field.label" :items="field.options" :hint="field.help" persistent-hint/>
            <v-slider v-else-if="field.type==='slider'" v-model="editorValues[field.key]" :label="field.label" :min="1" :max="field.key==='ringSeconds'?120:64" thumb-label/>
            <v-switch v-else-if="field.type==='switch'" v-model="editorValues[field.key]" :label="field.label" :hint="field.help" persistent-hint/>
          </template>
          <section v-if="activePage !== 'conferences' && currentForm.some((field) => field.type === 'members')" class="member-editor" :aria-label="membersEditorLabel"><h2>{{ membersEditorLabel }}</h2><v-list density="compact"><v-list-item v-for="member in activeMembers" :key="member.id"><v-text-field v-model="member.label" :label="membersFieldLabel" hint="Use the exact validated identifier described by this field." persistent-hint /><template #append><v-btn icon="mdi-delete-outline" variant="text" aria-label="Remove item" @click="removeMember(member.id)" /></template></v-list-item></v-list><p v-if="!activeMembers.length">{{ membersEmptyMessage }}</p><v-btn prepend-icon="mdi-plus" @click="addMember">Add item</v-btn></section>
          <v-alert v-if="['connected','degraded'].includes(connection)" type="info" variant="tonal">Saving sends this typed resource to the authenticated control service. Success appears only after the server confirms it.</v-alert>
          <v-alert v-if="activePage === 'conferences' && ['connected','degraded'].includes(connection)" type="info" variant="tonal">The native result distinguishes configuration applied and FreePBX reloaded; runtime verification remains pending. A saved room is not described as live until a real call proves it.</v-alert>
          <v-alert v-if="!['connected','degraded'].includes(connection)" type="warning" variant="tonal">Saving creates a local draft only. No PBX is connected.</v-alert>
        </v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="discardEditorDraft">Cancel</v-btn><v-btn color="primary" :disabled="(activePage === 'conferences' && conferenceErrors.length > 0) || (['connected','degraded'].includes(connection) && !canAttemptWriteCurrent)" @click="saveEditor">{{ ['connected','degraded'].includes(connection) ? editingResourceProvenance === 'local-draft' ? 'Review and send to control service' : 'Apply through control service' : 'Save local draft' }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="editorCloseConfirmOpen" max-width="560" persistent @keydown.esc.stop.prevent="editorCloseConfirmOpen=false"><v-card><v-card-title>Discard unsaved editor changes?</v-card-title><v-card-text><p>The current values differ from the last loaded or saved version. Keep editing to preserve them, or discard them and return focus to the control that opened this editor.</p></v-card-text><v-card-actions><v-btn @click="editorCloseConfirmOpen=false">Keep editing</v-btn><v-spacer/><v-btn color="error" variant="tonal" @click="confirmDiscardEditorDraft">Discard changes</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="paletteOpen" :fullscreen="false" max-width="860"><v-card class="palette"><v-card-title>Command palette</v-card-title><v-card-text><div class="search-row"><v-text-field v-model="paletteSearch.query" autofocus label="Search every page, command, setting, and appearance control" prepend-inner-icon="mdi-magnify" clearable/><v-btn icon="mdi-regex" aria-label="Open regex builder for command palette search" :color="paletteSearch.regex ? 'primary' : undefined" @click="openRegexBuilder('Command-palette search', 'palette', $event)"/></div><p class="search-result-count" role="status">{{ paletteResults.length }} of {{ pages.length }} destinations shown</p><p v-if="paletteCompiled.error" class="text-error" role="alert">{{ paletteCompiled.error }}</p><v-list><v-list-item v-for="item in paletteResults" :key="item.id" :title="item.label" :subtitle="`${item.group} · ${item.description}`" @click="openPage(item.id);paletteOpen=false"/><v-list-item v-if="!paletteResults.length" title="No matching destinations" subtitle="Clear the search or correct the regular expression." disabled/><v-list-item title="Theme"><template #append><SearchablePicker v-model="settings.theme" label="Theme" hide-details density="compact" :items="['system','light','dark']" no-data-text="No matching themes"/></template></v-list-item><v-list-item title="Narrator"><template #append><v-switch v-model="settings.narrator" hide-details/></template></v-list-item></v-list></v-card-text></v-card></v-dialog>

    <v-dialog v-model="regexDialogOpen" max-width="760" @keydown.esc.stop.prevent="finishRegexBuilder(false)"><v-card><v-card-title>Regular-expression builder · {{ regexContext }}</v-card-title><v-card-text><v-switch v-model="regexDraft.regex" label="Use regular expression"/><v-text-field v-model="regexDraft.query" label="Pattern or plain text"/><v-text-field v-model="regexDraft.flags" label="Flags" hint="Supported JavaScript flags: g i m s u y" persistent-hint/><div class="builder-chips"><v-chip v-for="token in ['^','$','[abc]','(group)','a|b','+','*','?']" :key="token" @click="regexDraft.query += token">{{ token }}</v-chip></div><v-alert v-if="regexDraftResult.error" type="error" variant="tonal">{{ regexDraftResult.error }}</v-alert><v-alert v-else type="success" variant="tonal">Pattern is valid for the JavaScript regular-expression engine.</v-alert></v-card-text><v-card-actions><v-btn @click="finishRegexBuilder(false)">Cancel</v-btn><v-spacer/><v-btn color="primary" :disabled="Boolean(regexDraftResult.error)" @click="finishRegexBuilder(true)">Apply to {{ regexContext }}</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="appearanceDialog" max-width="860"><v-card><v-card-title>Edit appearance: {{ appearanceTarget }}</v-card-title><v-card-text><p>This anchored editor changes the selected element only. Unsupported properties remain visible with an explanation.</p><v-tabs><v-tab>Typography</v-tab><v-tab>Color</v-tab><v-tab>Shape</v-tab><v-tab>States</v-tab></v-tabs><div class="appearance-grid"><v-text-field label="Font family" :model-value="settings.fontFamily"/><v-number-input label="Font size" :model-value="16"/><SearchablePicker v-model="appearanceDraft.weight" label="Weight" :items="[100,200,300,400,500,600,700,800,900]"/><v-checkbox label="Italic"/><SearchablePicker v-model="appearanceDraft.underline" label="Underline" :items="['None','Single','Double','Dotted','Wavy']"/><SearchablePicker v-model="appearanceDraft.strikethrough" label="Strikethrough" :items="['None','Single','Double']"/><v-number-input label="Letter spacing" suffix="px"/><v-number-input label="Line height"/><v-number-input label="Corner radius" suffix="px"/><SearchablePicker v-model="appearanceDraft.elevation" label="Elevation" :items="[0,1,2,3,4,5]"/></div><div class="d-flex flex-wrap justify-end ga-2"><v-btn variant="text" @click="discardAppearanceDraft">Cancel</v-btn><v-btn color="primary" @click="applyAppearanceDraft">Apply to this element</v-btn></div></v-card-text></v-card></v-dialog>

    <v-dialog v-model="lockWizardOpen" max-width="680"><v-card><v-card-title>Lock this element: {{ lockTarget }}</v-card-title><v-card-text><v-alert type="warning" variant="tonal">This is a toy lock, not security or encryption. Clearing local site storage or the application-data folder resets it.</v-alert><SearchablePicker v-model="lockMethod" label="Unlock method" :items="['Password stored as a local verifier','Time-based code from your authenticator']"/><SearchablePicker v-model="lockDuration" label="Unlock duration" :items="['This surface only','5 minutes','30 minutes','Until the app closes']"/><v-text-field v-model="lockCredentialDraft" type="password" label="Create this lock’s credential" autocomplete="new-password"/><p>Each element receives its own credential. Nothing is sent to a server or included in exports and history.</p></v-card-text><v-card-actions><v-btn @click="cancelLockDraft">Cancel</v-btn><v-spacer/><v-btn color="primary" :disabled="!lockCredentialDraft" @click="createToyLock">Create toy lock</v-btn></v-card-actions></v-card></v-dialog>

    <v-dialog v-model="superConfirmOpen" max-width="680" @keydown.esc.stop.prevent="cancelSuperConfirm"><v-card><v-card-title>Confirm destructive action</v-card-title><v-card-text><p>This removes the selected local draft. It cannot affect a live PBX while disconnected.</p><div class="key-grid"><v-checkbox v-model="confirmKeys.one" label="Key 1: I selected the intended item"/><v-checkbox v-model="confirmKeys.two" label="Key 2: I reviewed what will be removed"/></div><v-slider v-model="confirmKeys.slider" :disabled="!(confirmKeys.one&&confirmKeys.two)" min="0" max="100" step="1" label="Slide fully to authorize" thumb-label/></v-card-text><v-card-actions><v-btn @click="cancelSuperConfirm">Emergency exit</v-btn><v-spacer/><v-btn color="error" :disabled="!(confirmKeys.one&&confirmKeys.two&&confirmKeys.slider===100)" @click="completeDestructiveAction">Complete removal</v-btn></v-card-actions></v-card></v-dialog>

    <v-snackbar v-if="dimSum" :model-value="true" location="bottom right" timeout="7000"><strong>{{ dimSum.name }}</strong><p>A small startup surprise from the public dim-sum catalog.</p></v-snackbar>
    <div class="snackbar-stack" aria-live="polite"><v-alert v-for="notice in notices.slice(0,3)" :key="notice.id" :type="notice.level" closable variant="elevated" @click:close="notices=notices.filter(item=>item.id!==notice.id)"><strong>{{ notice.title }}</strong><div>{{ notice.body }}</div></v-alert></div>
  </v-app>
</template>
