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
