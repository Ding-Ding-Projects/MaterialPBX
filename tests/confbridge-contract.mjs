import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { FreePbxApplicationRequestSchema, FreePbxApplicationResultSchema, FreePbxConferenceConfigurationSchema } from '../packages/protocol/src/freepbx-application.ts'
import { DisconnectedMaterialPbxClient, HttpMaterialPbxClient } from '../packages/client/src/index.ts'
import { appendConferenceDigit, conferenceDefaults, conferenceEditorValues, conferenceFieldErrors, conferencePresetValues, conferenceReviewItems, removeConferenceDigit, serializeConferenceDraft, validateConferenceDraft } from '../packages/ui/src/conference.ts'

const validConfiguration = {
  number: '70',
  maxParticipants: 2,
  recordConference: false,
  announceJoinLeave: false,
  startMuted: false,
  musicOnHoldWhenEmpty: false,
  quiet: false,
}

const defaults = FreePbxConferenceConfigurationSchema.parse({ number: '700', maxParticipants: 20 })
assert.deepEqual(defaults, { ...validConfiguration, number: '700', maxParticipants: 20 })
for (const number of ['10', '123456789012']) assert.equal(FreePbxConferenceConfigurationSchema.parse({ ...validConfiguration, number }).number, number)
for (const number of ['1', '1234567890123', '70A', '', 700]) assert.equal(FreePbxConferenceConfigurationSchema.safeParse({ ...validConfiguration, number }).success, false)
for (const maxParticipants of [2, 200]) assert.equal(FreePbxConferenceConfigurationSchema.parse({ ...validConfiguration, maxParticipants }).maxParticipants, maxParticipants)
for (const maxParticipants of [1, 201, 2.5, '20', null]) assert.equal(FreePbxConferenceConfigurationSchema.safeParse({ ...validConfiguration, maxParticipants }).success, false)
assert.equal(FreePbxConferenceConfigurationSchema.safeParse({ ...validConfiguration, recordConference: 'yes' }).success, false)
assert.equal(FreePbxConferenceConfigurationSchema.safeParse({ ...validConfiguration, surprise: true }).success, false)
const conflict = FreePbxConferenceConfigurationSchema.safeParse({ ...validConfiguration, announceJoinLeave: true, quiet: true })
assert.equal(conflict.success, false)
assert.match(conflict.error?.issues[0]?.message ?? '', /Turn off quiet mode/)

const dispatched = FreePbxApplicationRequestSchema.parse({ id: 'conference-700', displayName: 'Team room', enabled: true, revision: 4, feature: 'conference', configuration: validConfiguration })
assert.equal(dispatched.feature, 'conference')
assert.deepEqual(dispatched.configuration, validConfiguration)
assert.equal(FreePbxApplicationResultSchema.shape.storedDesired.safeParse(null).success, true)

const draft = conferenceDefaults()
assert.deepEqual(conferenceEditorValues(), {
  name: 'Conference room 700', enabled: true, number: '700', maxParticipants: 20,
  recordConference: false, announceJoinLeave: false, startMuted: false,
  musicOnHoldWhenEmpty: false, quiet: false,
})
assert.deepEqual(conferenceEditorValues({ name: 'Loaded room', enabled: false, details: { number: '801', maxParticipants: 42, recordConference: true, announceJoinLeave: false, startMuted: true, musicOnHoldWhenEmpty: false, quiet: false } }), {
  name: 'Loaded room', enabled: false, number: '801', maxParticipants: 42,
  recordConference: true, announceJoinLeave: false, startMuted: true,
  musicOnHoldWhenEmpty: false, quiet: false,
})
assert.deepEqual(draft, { ...validConfiguration, roomName: 'Conference room 700', enabled: true, number: '700', maxParticipants: 20 })
assert.deepEqual(validateConferenceDraft(draft), [])
assert.match(conferenceFieldErrors({ ...draft, roomName: '' }).roomName?.[0] ?? '', /1 to 80/)
assert.match(conferenceFieldErrors({ ...draft, roomName: 'x'.repeat(81) }).roomName?.[0] ?? '', /1 to 80/)
for (const field of ['enabled', 'recordConference', 'announceJoinLeave', 'startMuted', 'musicOnHoldWhenEmpty', 'quiet']) assert.match(conferenceFieldErrors({ ...draft, [field]: 'false' })[field]?.[0] ?? '', /on or off/)
assert.equal(appendConferenceDigit('0', 0), '00')
assert.equal(appendConferenceDigit('123456789012', 3), '123456789012')
assert.equal(removeConferenceDigit('700'), '70')
Object.assign(draft, conferencePresetValues('team'))
assert.equal(draft.maxParticipants, 20)
assert.equal(draft.announceJoinLeave, true)
assert.match(conferenceReviewItems(draft).join(' | '), /Recorded-name announcements on/)
Object.assign(draft, conferencePresetValues('event'))
assert.equal(draft.startMuted, true)
assert.equal(draft.quiet, true)
assert.match(conferenceReviewItems(draft).join(' | '), /\*1 unmutes/)
assert.deepEqual(serializeConferenceDraft(draft), { ...validConfiguration, number: '700', maxParticipants: 100, startMuted: true, musicOnHoldWhenEmpty: true, quiet: true })
assert.throws(() => serializeConferenceDraft({ ...draft, maxParticipants: 201 }), /Maximum participants/)
assert.deepEqual(validateConferenceDraft({ ...draft, announceJoinLeave: true, quiet: true }), ['Turn off quiet mode or turn off join and leave announcements. Quiet mode suppresses those announcements.'])

const localStorageValues = new Map()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => localStorageValues.get(key) ?? null, setItem: (key, value) => localStorageValues.set(key, String(value)), removeItem: key => localStorageValues.delete(key) } })
const localClient = new DisconnectedMaterialPbxClient()
const localResource = { id: 'draft-conference', kind: 'conferences', name: '700', summary: 'Local conference draft', enabled: true, tags: [], updatedAt: new Date(0).toISOString(), details: validConfiguration }
const localSave = await localClient.save(localResource)
assert.equal(localSave.ok, true)
assert.equal(localSave.storedLocally, true)
assert.equal((await localClient.list('conferences'))[0]?.id, 'draft-conference')
assert.equal((await new DisconnectedMaterialPbxClient().list('conferences'))[0]?.provenance, 'local-draft')
const localEnvelope = JSON.parse(localStorageValues.get('materialpbx.resource-drafts.v1'))
assert.equal(localEnvelope.version, 1)
assert.equal(localEnvelope.drafts.length, 1)
localStorageValues.set('materialpbx.resource-drafts.v1', JSON.stringify({ version: 1, drafts: Array.from({ length: 100 }, (_, index) => ({ ...localEnvelope.drafts[0], id: `bounded-${index}` })) }))
const overCount = await localClient.save({ ...localResource, id: 'bounded-overflow' })
assert.equal(overCount.ok, false)
assert.match(overCount.message, /at most 100 resources/)
localStorageValues.set('materialpbx.resource-drafts.v1', JSON.stringify(localEnvelope))
const overBytes = await localClient.save({ ...localResource, id: 'oversized-draft', details: { ...validConfiguration, note: 'x'.repeat(300_000) } })
assert.equal(overBytes.ok, false)
assert.match(overBytes.message, /256 KiB/)
localStorageValues.set('materialpbx.resource-drafts.v1', JSON.stringify({ version: 2, drafts: localEnvelope.drafts }))
assert.equal((await new DisconnectedMaterialPbxClient().list('conferences')).length, 0)
assert.equal(localStorageValues.has('materialpbx.resource-drafts.v1'), false)
await localClient.save(localResource)

const managedConference = { id: 'conference-700', kind: 'conferences', displayName: 'Team room', enabled: true, revision: 5, configuration: validConfiguration, createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:01:00.000Z' }
const applicationOutcome = { storedDesired: true, applied: true, reloaded: false, runtimeVerification: 'pending', partialFailure: true, compilation: { status: 'compiled', compiler: 'conference-freepbx-bmo-v1' }, rollback: { attempted: false, succeeded: null, snapshotId: 'snapshot', reason: null }, warning: 'Reload is pending.' }
let submittedMutation
const fetcher = async (url, init = {}) => {
  if (String(url).endsWith('/v1/resources?kind=conferences')) return new Response(JSON.stringify({ items: [managedConference] }), { status: 200 })
  submittedMutation = JSON.parse(String(init.body))
  return new Response(JSON.stringify({ resource: { ...managedConference, revision: 6 }, application: applicationOutcome }), { status: 200 })
}
const httpClient = new HttpMaterialPbxClient('https://pbx.example.test', 'credential', fetcher)
const listed = await httpClient.list('conferences')
assert.deepEqual(listed[0], { id: 'conference-700', kind: 'conferences', name: 'Team room', summary: '', enabled: true, tags: [], updatedAt: managedConference.updatedAt, revision: 5, details: validConfiguration, provenance: 'server', pendingReview: false })
const saved = await httpClient.save({ ...listed[0], revision: 5 })
assert.deepEqual(submittedMutation, { displayName: 'Team room', enabled: true, expectedRevision: 5, configuration: validConfiguration })
assert.equal(saved.resource?.revision, 6)
assert.equal(saved.application?.applied, true)
assert.equal(saved.application?.reloaded, false)
assert.equal(saved.application?.runtimeVerification, 'pending')
assert.equal(saved.application?.partialFailure, true)
assert.match(saved.message, /runtime verification: pending/)

const ui = await readFile(new URL('../packages/ui/src/MaterialPbxApp.vue', import.meta.url), 'utf8')
const adapter = await readFile(new URL('../services/control-plane/src/adapters/freepbx.ts', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../packages/client/src/index.ts', import.meta.url), 'utf8')
const registry = await readFile(new URL('../services/freepbx-module/NativeCompilerRegistry.php', import.meta.url), 'utf8')
const moduleSource = await readFile(new URL('../services/freepbx-module/Materialpbx.class.php', import.meta.url), 'utf8')

const uiRequirements = [
  "conferences: []",
  "activePage === 'conferences'",
  'Guided conference room settings',
  'Room name',
  'Accept calls',
  'Conference number dial pad',
  'Conference number',
  'Maximum participants stepper',
  'Maximum participants slider',
  'Record the conference',
  'Announce who joins and leaves',
  'Start each participant muted',
  'Play waiting music while a caller is alone',
  'Quiet mode',
  'each caller records their name',
  'PBX default music class',
  'runtime verification remains pending',
  'Files go to the PBX recording store',
  "applyConferencePreset('small')",
  "applyConferencePreset('team')",
  "applyConferencePreset('event')",
  'conferenceErrors.length > 0',
  'Advanced native behavior (validated)',
  'Local draft · review before sending',
  'Review and send to control service',
  '@update:model-value="stageResourceEnabled(resource, $event)"',
  '@update:model-value="requestEditorClose"',
  'Discard unsaved editor changes?',
  "conferenceErrorMessages('roomName')",
  'focusConferenceFirstError()',
  'v-if="editorIsNew" type="info"',
  `v-if="!['connected','degraded'].includes(connection)"`,
]
const validateUi = (source) => { for (const requirement of uiRequirements) assert.ok(source.includes(requirement), `Missing conference UI registration: ${requirement}`) }
validateUi(ui)
for (const [index, requirement] of uiRequirements.entries()) assert.throws(() => validateUi(ui.replaceAll(requirement, `REMOVED_UI_${index}`)), /Missing conference UI registration/)

const integrationRequirements = [
  [adapter, 'conferences: "conference"'],
  [clientSource, 'displayName: resource.name'],
  [clientSource, 'configuration: resource.details ?? {}'],
  [clientSource, 'expectedRevision: resource.revision'],
  [clientSource, 'mapApplication(value.application)'],
  [clientSource, "localDraftStorageKey = 'materialpbx.resource-drafts.v1'"],
  [clientSource, 'localDraftLimit = 100'],
  [clientSource, 'localDraftByteLimit = 256 * 1024'],
  [clientSource, "provenance: 'local-draft'"],
  [registry, "if ($kind === 'conferences') return $this->previewConference($resource);"],
  [registry, "'compiler' => 'conference-freepbx-bmo-v1'"],
  [registry, "'route' => 'FreePBX::Conferences'"],
  [registry, "['s']"],
  [moduleSource, "'conference' => 'conferences'"],
  [moduleSource, "private function transitionConferenceArtifacts"],
  [moduleSource, "FreePBX::Conferences()"],
  [moduleSource, "explicit BMO compensation"],
  [moduleSource, "conference-freepbx-bmo-v1"],
]
for (const [source, requirement] of integrationRequirements) {
  const validateRegistration = (candidate) => assert.ok(candidate.includes(requirement), `Missing conference integration registration: ${requirement}`)
  validateRegistration(source)
  assert.throws(() => validateRegistration(source.replaceAll(requirement, 'REMOVED_REGISTRATION')), /Missing conference integration registration/)
}

console.log(`ConfBridge contract passed: ${uiRequirements.length} exact UI registrations, ${integrationRequirements.length} exact integration registrations, protocol/helper validation and serialization, client mutation/result mapping, and versioned local-draft persistence.`)
