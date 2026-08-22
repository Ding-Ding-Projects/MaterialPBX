export interface ConferenceDraft {
  roomName?: unknown
  enabled?: unknown
  number: unknown
  maxParticipants: unknown
  recordConference: unknown
  announceJoinLeave: unknown
  startMuted: unknown
  musicOnHoldWhenEmpty: unknown
  quiet: unknown
}

export type ConferenceField = 'roomName' | 'enabled' | 'number' | 'maxParticipants' | 'recordConference' | 'announceJoinLeave' | 'startMuted' | 'musicOnHoldWhenEmpty' | 'quiet'
export type ConferenceFieldErrors = Partial<Record<ConferenceField, string[]>>

export type ConferencePreset = 'small' | 'team' | 'event'

export function appendConferenceDigit(value: unknown, digit: number): string {
  const current = String(value ?? '')
  if (!Number.isInteger(digit) || digit < 0 || digit > 9 || current.length >= 12) return current
  return `${current}${digit}`
}

export function removeConferenceDigit(value: unknown): string { return String(value ?? '').slice(0, -1) }

export const conferenceDefaults = (): ConferenceDraft => ({
  roomName: 'Conference room 700',
  enabled: true,
  number: '700',
  maxParticipants: 20,
  recordConference: false,
  announceJoinLeave: false,
  startMuted: false,
  musicOnHoldWhenEmpty: false,
  quiet: false,
})

export function conferenceFieldErrors(draft: ConferenceDraft): ConferenceFieldErrors {
  const failures: ConferenceFieldErrors = {}
  const add = (field: ConferenceField, message: string) => { (failures[field] ??= []).push(message) }
  if (Object.prototype.hasOwnProperty.call(draft, 'roomName')) {
    const name = typeof draft.roomName === 'string' ? draft.roomName.trim() : ''
    if (name.length < 1 || name.length > 80) add('roomName', 'Room name must contain 1 to 80 characters.')
  }
  if (Object.prototype.hasOwnProperty.call(draft, 'enabled') && typeof draft.enabled !== 'boolean') add('enabled', 'Accept calls must be either on or off.')
  const number = String(draft.number ?? '').trim()
  const maximum = Number(draft.maxParticipants)
  if (!/^[0-9]{2,12}$/.test(number)) add('number', 'Conference number must contain 2 to 12 digits, such as 700.')
  if (!Number.isInteger(maximum) || maximum < 2 || maximum > 200) add('maxParticipants', 'Maximum participants must be a whole number from 2 through 200.')
  for (const field of ['recordConference', 'announceJoinLeave', 'startMuted', 'musicOnHoldWhenEmpty', 'quiet'] as const) {
    if (typeof draft[field] !== 'boolean') add(field, `${field} must be either on or off.`)
  }
  if (draft.quiet === true && draft.announceJoinLeave === true) {
    const message = 'Turn off quiet mode or turn off join and leave announcements. Quiet mode suppresses those announcements.'
    add('announceJoinLeave', message)
    add('quiet', message)
  }
  return failures
}

export function validateConferenceDraft(draft: ConferenceDraft): string[] {
  return [...new Set(Object.values(conferenceFieldErrors(draft)).flat())]
}

export function conferencePresetValues(preset: ConferencePreset): Omit<ConferenceDraft, 'number' | 'roomName' | 'enabled'> {
  if (preset === 'small') return { maxParticipants: 6, recordConference: false, announceJoinLeave: false, startMuted: false, musicOnHoldWhenEmpty: false, quiet: false }
  if (preset === 'team') return { maxParticipants: 20, recordConference: false, announceJoinLeave: true, startMuted: false, musicOnHoldWhenEmpty: false, quiet: false }
  return { maxParticipants: 100, recordConference: false, announceJoinLeave: false, startMuted: true, musicOnHoldWhenEmpty: true, quiet: true }
}

export function conferenceReviewItems(draft: ConferenceDraft): string[] {
  return [
    ...(typeof draft.roomName === 'string' ? [`Room ${draft.roomName.trim() || '—'}`] : []),
    ...(typeof draft.enabled === 'boolean' ? [draft.enabled ? 'Accepting calls' : 'Not accepting calls'] : []),
    `Dial ${String(draft.number ?? '') || '—'} to enter`,
    `Capacity ${Number(draft.maxParticipants ?? 0) || '—'}`,
    draft.recordConference ? 'Recording on' : 'Recording off',
    draft.announceJoinLeave ? 'Recorded-name announcements on' : 'Recorded-name announcements off',
    draft.startMuted ? 'Participants begin muted; *1 unmutes' : 'Participants begin able to speak',
    draft.musicOnHoldWhenEmpty ? 'Waiting music on while alone' : 'Waiting music off',
    draft.quiet ? 'Quiet mode on' : 'Quiet mode off',
  ]
}

export function serializeConferenceDraft(draft: ConferenceDraft) {
  const failures = validateConferenceDraft(draft)
  if (failures.length) throw new Error(failures.join(' '))
  return {
    number: String(draft.number).trim(),
    maxParticipants: Number(draft.maxParticipants),
    recordConference: draft.recordConference as boolean,
    announceJoinLeave: draft.announceJoinLeave as boolean,
    startMuted: draft.startMuted as boolean,
    musicOnHoldWhenEmpty: draft.musicOnHoldWhenEmpty as boolean,
    quiet: draft.quiet as boolean,
  }
}
