/**
 * `FieldRecipes.dateTime`, in both stored forms, through a real form: `local`
 * keeps the wall-clock text as typed, and `instant` reads and shows an ISO
 * instant as one zone's clocks do, across the hours the clocks skip and repeat.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { describe, expect, it } from 'vitest'
import { FieldRecipes, type Stored } from '../src/index.js'

const formOf = (stored: Stored) =>
  Form.make('Event', Form.input(Schema.Struct({ at: Schema.String })), {
    inputs: { at: FieldRecipes.dateTime(stored).control },
  })
type EventForm = ReturnType<typeof formOf>

const typed = (form: EventForm, draft: string) =>
  form.bundle.update(
    form.bundle.update(form.initial, form.Message.Changed({ key: 'at', value: draft }), undefined)
      .model,
    form.Message.ValidatedAll(),
    undefined,
  ).model
const submitted = (form: EventForm, draft: string) => form.engine.value(typed(form, draft))?.at
const errorOf = (form: EventForm, draft: string) => {
  const field = form.field(typed(form, draft), 'at')
  return field._tag === 'Invalid' ? field.errors : []
}
const shown = (form: EventForm, value: string) =>
  form.fill(form.initial, { at: value }).model.fields.at.value

const london = formOf({ stored: 'instant', zone: 'Europe/London' })
const newYork = formOf({ stored: 'instant', zone: 'America/New_York' })
const local = formOf({ stored: 'local' })

describe('a date and a time stored as local text', () => {
  it.each([
    '2026-10-26T09:30',
    '2026-10-26T09:30:00',
    '2026-10-26T09:30:15',
    '2026-10-26T09:30:15.250',
  ])('submits %s as it was typed, and shows it back unchanged', text => {
    expect(submitted(local, text)).toBe(text)
    expect(shown(local, text)).toBe(text)
  })

  it.each([
    '2026-10-26',
    '2026-10-26T9:30',
    '2026-10-26T24:00',
    '2026-02-30T09:30',
    '2026-10-26 09:30',
  ])('reads %s as no time, and says so', draft =>
    expect(errorOf(local, draft)).toEqual(['Enter a date and a time that exists']),
  )

  it('refuses to fill an instant, which local text is not', () => {
    expect(() => shown(local, '2026-10-26T09:30:00.000Z')).toThrow(/"at".*local date and time/)
  })
})

describe('a date and a time stored as an instant, in a zone', () => {
  it('shows an instant as the zone’s clocks read it, in summer and in winter', () => {
    expect(shown(london, '2026-07-01T08:30:00.000Z')).toBe('2026-07-01T09:30')
    expect(shown(london, '2026-01-15T09:30:00.000Z')).toBe('2026-01-15T09:30')
    expect(shown(newYork, '2026-07-01T08:30:00.000Z')).toBe('2026-07-01T04:30')
  })

  it('reads any offset the instant was written with', () => {
    expect(shown(london, '2026-07-01T10:30:00+02:00')).toBe('2026-07-01T09:30')
  })

  it('submits what was typed as the instant the zone’s clocks read so', () => {
    expect(submitted(london, '2026-07-01T09:30')).toBe('2026-07-01T08:30:00.000Z')
    expect(submitted(london, '2026-01-15T09:30')).toBe('2026-01-15T09:30:00.000Z')
    expect(submitted(newYork, '2026-01-15T09:30')).toBe('2026-01-15T14:30:00.000Z')
  })

  it.each([
    [london, '2026-03-29T01:30'],
    [newYork, '2026-03-08T02:30'],
  ])('refuses a time the clocks skip', (form, draft) =>
    expect(errorOf(form, draft)).toEqual(['Enter a date and a time that exists']),
  )

  it.each([
    [london, '2026-10-25T01:30', '2026-10-25T00:30:00.000Z'],
    [newYork, '2026-11-01T01:30', '2026-11-01T05:30:00.000Z'],
  ])('reads a time the clocks repeat as the earlier', (form, draft, instant) =>
    expect(submitted(form, draft)).toBe(instant),
  )

  it('shows back the instant it submits, seconds and all', () => {
    for (const instant of [
      '2026-07-01T08:30:00.000Z',
      '2026-07-01T08:30:15.000Z',
      '2026-07-01T08:30:15.250Z',
    ])
      expect(submitted(london, shown(london, instant))).toBe(instant)
  })

  it('refuses to fill local text, which names no instant', () => {
    expect(() => shown(london, '2026-07-01T09:30')).toThrow(/"at".*an instant/)
  })

  it('refuses a zone the runtime does not know, when it is made', () => {
    expect(() => FieldRecipes.dateTime({ stored: 'instant', zone: 'Mars/Olympus' })).toThrow(
      /"Mars\/Olympus" is not a time zone/,
    )
  })
})

// A stored instant is shown only as a draft that submits it again, unchanged.
describe('an instant filled and submitted unchanged', () => {
  const unchanged = (form: EventForm, instant: string) => submitted(form, shown(form, instant))

  // The later of a repeated hour reads back as itself, not as the earlier (#313).
  it.each([
    [newYork, '2026-11-01T05:30:00.000Z', '2026-11-01T01:30'],
    [newYork, '2026-11-01T06:30:00.000Z', '2026-11-01T01:30-05:00'],
    [london, '2026-10-25T00:30:00.000Z', '2026-10-25T01:30'],
    [london, '2026-10-25T01:30:00.000Z', '2026-10-25T01:30+00:00'],
    [
      formOf({ stored: 'instant', zone: 'America/St_Johns' }),
      '2026-11-01T04:15:00.000Z',
      '2026-11-01T01:45',
    ],
    [
      formOf({ stored: 'instant', zone: 'America/St_Johns' }),
      '2026-11-01T04:45:00.000Z',
      '2026-11-01T01:15-03:30',
    ],
    [
      formOf({ stored: 'instant', zone: 'Australia/Lord_Howe' }),
      '2026-04-04T15:15:00.000Z',
      '2026-04-05T01:45+10:30',
    ],
  ])('keeps %#: shows it as its draft, and submits it unchanged', (form, instant, draft) => {
    expect(shown(form, instant)).toBe(draft)
    expect(unchanged(form, instant)).toBe(instant)
  })

  // Around each change of the clocks in 2026, a skipped or repeated hour among them.
  it.each([
    'Europe/London',
    'America/New_York',
    'America/St_Johns',
    'Australia/Lord_Howe',
    'America/Santiago',
  ])('keeps every quarter hour around each change of the clocks in %s', zone => {
    const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
    const offsetAt = (at: number) =>
      offset.formatToParts(at).find(part => part.type === 'timeZoneName')?.value
    const day = 86_400_000
    const changes: Array<number> = []
    for (let at = Date.UTC(2026, 0, 1); at < Date.UTC(2027, 0, 1); at += day)
      if (offsetAt(at) !== offsetAt(at + day)) changes.push(at)
    expect(changes).toHaveLength(2)
    const { control } = FieldRecipes.dateTime({ stored: 'instant', zone })
    const moved: Array<string> = []
    for (const change of changes)
      for (let at = change - day; at < change + 2 * day; at += 15 * 60_000) {
        const instant = new Date(at).toISOString()
        const again = control.parse!(control.format!(instant, control.data), control.data)
        if (again !== instant) moved.push(`${instant} -> ${String(again)}`)
      }
    expect(moved).toEqual([])
  })

  it('reads a typed offset as that occurrence, if the zone’s clocks have it then', () => {
    expect(submitted(newYork, '2026-11-01T01:30-04:00')).toBe('2026-11-01T05:30:00.000Z')
    expect(submitted(newYork, '2026-11-01T01:30-05:00')).toBe('2026-11-01T06:30:00.000Z')
    expect(submitted(london, '2026-07-01T09:30+01:00')).toBe('2026-07-01T08:30:00.000Z')
  })

  it.each([
    [newYork, '2026-11-01T01:30-06:00'],
    [london, '2026-07-01T09:30+00:00'],
    [london, '2026-03-29T01:30+00:00'],
  ])('refuses %#: an offset the zone’s clocks do not have then', (form, draft) =>
    expect(errorOf(form, draft)).toEqual(['Enter a date and a time that exists']),
  )

  // Showing a finer instant as a reading would drop the rest of it (#314).
  it('refuses an instant finer than a millisecond, and keeps one written with zeros', () => {
    expect(() => shown(london, '2026-07-01T08:30:15.123456Z')).toThrow(/"at".*to the millisecond/)
    expect(() => shown(london, '2026-07-01T08:30:15.0001Z')).toThrow(/to the millisecond/)
    expect(shown(london, '2026-07-01T08:30:15.123000Z')).toBe('2026-07-01T09:30:15.123')
    expect(unchanged(london, '2026-07-01T08:30:15.123000Z')).toBe('2026-07-01T08:30:15.123Z')
  })

  // `Date.parse` moves `02-30` into March (#315).
  it.each([
    '2026-02-30T10:00:00Z',
    '2025-02-29T10:00:00Z',
    '2026-04-31T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-00-10T10:00:00Z',
    '2026-07-01T24:00:00Z',
    '2026-07-01T10:60:00Z',
    '2026-07-01T10:00:60Z',
    '2026-07-01T10:00:00+24:00',
    '2026-07-01T10:00:00+05:60',
  ])('refuses to fill %s, which names no real time, and lists it as written', value => {
    expect(() => shown(london, value)).toThrow(/"at".*an instant/)
    const { display } = FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })
    expect(display.text(value, {})).toBe(value)
  })

  it('fills a leap day, which is real', () => {
    expect(unchanged(london, '2024-02-29T10:00:00.000Z')).toBe('2024-02-29T10:00:00.000Z')
  })

  it.each(['2026-02-30T09:30', '2026-02-29T09:30', '2026-02-30T09:30+00:00'])(
    'reads a typed %s, a day that does not exist, as no time',
    draft => expect(errorOf(london, draft)).toEqual(['Enter a date and a time that exists']),
  )

  it.each([
    ['Europe/Berlin', '9999-12-31T23:30:00.000Z'],
    ['America/New_York', '0000-01-01T00:30:00.000Z'],
  ])('refuses to fill an instant %s’s clocks read in no four-digit year', (zone, instant) => {
    expect(() => shown(formOf({ stored: 'instant', zone }), instant)).toThrow(/"at".*an instant/)
  })
})

// Across a year's end, a leap day, and year 0, which the clocks' formatter calls 1 BC (#321).
describe('an instant at a boundary, filled and submitted unchanged', () => {
  it.each([
    ['UTC', '0000-12-31T12:00:00.000Z', '0000-12-31T12:00'],
    ['UTC', '0000-01-01T00:00:00.000Z', '0000-01-01T00:00'],
    ['UTC', '0001-01-01T00:00:00.000Z', '0001-01-01T00:00'],
    ['America/New_York', '0001-01-01T03:00:00.000Z', '0000-12-31T22:03:58'],
    ['America/New_York', '2000-01-01T04:59:59.999Z', '1999-12-31T23:59:59.999'],
    ['Pacific/Kiritimati', '2026-12-31T10:00:00.000Z', '2027-01-01T00:00'],
    ['Pacific/Kiritimati', '2024-02-28T10:30:00.000Z', '2024-02-29T00:30'],
    ['Europe/London', '2024-02-29T23:30:00.000Z', '2024-02-29T23:30'],
    ['UTC', '9999-12-31T23:59:59.999Z', '9999-12-31T23:59:59.999'],
  ])('in %s keeps %s, shown as %s', (zone, instant, draft) => {
    const form = formOf({ stored: 'instant', zone })
    expect(shown(form, instant)).toBe(draft)
    expect(submitted(form, shown(form, instant))).toBe(instant)
  })
})

describe('a date and a time in a list', () => {
  const spaced = (text: string) => text.replace(/\s/g, ' ')
  it('reads an instant in the zone and a local text as written', () => {
    const { display } = FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })
    expect(spaced(display.text('2026-07-01T08:30:00.000Z', {}))).toBe('Jul 1, 2026, 9:30 AM')
    const shownLocal = FieldRecipes.dateTime({ stored: 'local', locale: 'de' }).display
    expect(spaced(shownLocal.text('2026-07-01T09:30', {}))).toBe('01.07.2026, 09:30')
  })
})

// `Date.UTC` reads a year under 100 as 19xx; a date input writes year 0001.
describe('a year under 100', () => {
  it('is kept as written, read and shown', () => {
    const instant = FieldRecipes.dateTime({ stored: 'instant', zone: 'UTC' }).control
    expect(instant.parse!('0050-06-01T12:00', instant.data)).toBe('0050-06-01T12:00:00.000Z')
    expect(instant.format!('0050-06-01T12:00:00.000Z', instant.data)).toBe('0050-06-01T12:00')
    expect(FieldRecipes.dateTime({ stored: 'local' }).display.text('0050-03-05T09:30', {})).toBe(
      'Mar 5, 50, 9:30 AM',
    )
  })
})

describe('an instant past year 9999', () => {
  it('is refused, since it could not be shown again', () => {
    const instant = FieldRecipes.dateTime({ stored: 'instant', zone: 'America/New_York' }).control
    expect(instant.parse!('9999-12-31T23:30', instant.data)).toBeUndefined()
    expect(instant.parse!('9999-12-31T18:00', instant.data)).toBe('9999-12-31T23:00:00.000Z')
  })
})
