/**
 * Wall-clock readings and the instants they name in a time zone. A reading in a
 * zone names no instant when the clocks skip it, and two when they repeat it;
 * the zone is always a parameter, never the runtime's.
 */
import { Option } from 'effect'
import { isCalendarDate } from 'foldkit/calendar'

/** A date and a time of day, in no zone. */
export interface Wall {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly millisecond: number
}

// What a `datetime-local` input writes: minutes, and seconds only with a step under a minute.
const naive = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

/** The reading a naive text names, or none for text that is not one, or names no real time. */
export const readWall = (text: string): Option.Option<Wall> => {
  const parts = naive.exec(text)
  if (parts === null) return Option.none()
  const [year, month, day, hour, minute, second = '0', fraction = ''] = parts.slice(1)
  const wall: Wall = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(fraction.padEnd(3, '0')),
  }
  const real =
    isCalendarDate({ year: wall.year, month: wall.month, day: wall.day }) &&
    wall.hour < 24 &&
    wall.minute < 60 &&
    wall.second < 60
  return real ? Option.some(wall) : Option.none()
}

const two = (value: number) => String(value).padStart(2, '0')

/** A reading as a `datetime-local` input shows it: seconds only when it has them. */
export const writeWall = (wall: Wall): string => {
  const date = `${String(wall.year).padStart(4, '0')}-${two(wall.month)}-${two(wall.day)}`
  const seconds =
    wall.second === 0 && wall.millisecond === 0
      ? ''
      : `:${two(wall.second)}${wall.millisecond === 0 ? '' : `.${String(wall.millisecond).padStart(3, '0')}`}`
  return `${date}T${two(wall.hour)}:${two(wall.minute)}${seconds}`
}

/**
 * The reading as if it were in UTC, in milliseconds: what offsets are measured
 * from. Set field by field, since `Date.UTC` reads a year under 100 as 19xx.
 */
export const utcOf = (wall: Wall): number => {
  const at = new Date(0)
  at.setUTCFullYear(wall.year, wall.month - 1, wall.day)
  at.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond)
  return at.getTime()
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

/** One formatter per locale and options: a display runs per cell, and making one is the slow part. */
export const dateFormat = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = JSON.stringify([locale, options])
  const known = dateFormats.get(key)
  if (known !== undefined) return known
  const made = new Intl.DateTimeFormat(locale, options)
  dateFormats.set(key, made)
  return made
}

// One formatter per zone: making one is the slow part.
const formatters = new Map<string, Intl.DateTimeFormat>()
const formatterOf = (zone: string): Intl.DateTimeFormat => {
  const known = formatters.get(zone)
  if (known !== undefined) return known
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    fractionalSecondDigits: 3,
  })
  formatters.set(zone, made)
  return made
}

/** Refuses a zone the runtime does not know, naming it. */
export const knownZone = (zone: string, who: string): string => {
  try {
    formatterOf(zone)
  } catch {
    throw new Error(`${who}: "${zone}" is not a time zone this runtime knows`)
  }
  return zone
}

/** What the clocks in `zone` read at an instant. */
export const wallOf = (instant: number, zone: string): Wall => {
  const parts = Object.fromEntries(
    formatterOf(zone)
      .formatToParts(new Date(instant))
      .map(part => [part.type, part.value]),
  )
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    second: Number(parts['second']),
    millisecond: Number(parts['fractionalSecond']),
  }
}

const day = 86_400_000

/**
 * The instant at which the clocks in `zone` read `wall`: none in a gap the
 * clocks skip (a spring change), and the earlier of the two in an hour they
 * repeat (an autumn one). The offsets a day either side are the only ones that
 * can apply, since no zone changes its offset twice in two days.
 */
export const instantOf = (wall: Wall, zone: string): Option.Option<number> => {
  const local = utcOf(wall)
  const offsets = new Set(
    [local - day, local + day].map(around => utcOf(wallOf(around, zone)) - around),
  )
  const instants = [...offsets]
    .map(offset => local - offset)
    .filter(instant => utcOf(wallOf(instant, zone)) === local)
  return instants.length === 0 ? Option.none() : Option.some(Math.min(...instants))
}

const offsetText = /^([+-])(\d{2}):(\d{2})$/

/** The milliseconds `Z` or `±HH:MM` is ahead of UTC, or none for an offset past ±23:59. */
const offsetOf = (text: string): Option.Option<number> => {
  if (text === 'Z') return Option.some(0)
  const parts = offsetText.exec(text)
  if (parts === null) return Option.none()
  const [, sign, hours = '', minutes = ''] = parts
  if (Number(hours) > 23 || Number(minutes) > 59) return Option.none()
  return Option.some((sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000)
}

const writeOffset = (offset: number): string => {
  const minutes = Math.abs(offset) / 60_000
  return `${offset < 0 ? '-' : '+'}${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`
}

// The ISO form alone, offset and all: `Date.parse` takes much else, in the runtime's
// zone, and moves a day that does not exist (`02-30`) into the next month.
const isoInstant = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/

/**
 * The instant stored ISO text names, or none for text that is not one, names
 * no real date and time, or is finer than a millisecond: a reading holds no
 * finer, so showing such an instant would change it.
 */
export const readInstant = (text: string): Option.Option<number> => {
  const parts = isoInstant.exec(text)
  if (parts === null) return Option.none()
  const [, reading = '', fraction = '', offset = ''] = parts
  if (/[1-9]/.test(fraction.slice(3))) return Option.none()
  return Option.flatMap(
    readWall(fraction === '' ? reading : `${reading}.${fraction.slice(0, 3)}`),
    wall => Option.map(offsetOf(offset), ahead => utcOf(wall) - ahead),
  )
}

const withOffset = /^(.*)([+-]\d{2}:\d{2})$/

/**
 * The instant a draft names in `zone`. A reading alone names the one instant
 * the clocks read so, or the earlier of two they repeat; one with an offset
 * (`2026-11-01T01:30-05:00`) names the instant of that offset, when the clocks
 * read so then. None for a time they skip, or an offset they do not have there.
 */
export const instantIn = (draft: string, zone: string): Option.Option<number> => {
  const parts = withOffset.exec(draft)
  if (parts === null) return Option.flatMap(readWall(draft), wall => instantOf(wall, zone))
  const [, reading = '', offset = ''] = parts
  return Option.flatMap(readWall(reading), wall =>
    Option.filter(
      Option.map(offsetOf(offset), ahead => utcOf(wall) - ahead),
      instant => utcOf(wallOf(instant, zone)) === utcOf(wall),
    ),
  )
}

/**
 * The draft of an instant in `zone`: what the clocks read, with the offset
 * only where the reading alone would name another instant, the later of a
 * repeated hour, so that it reads back as the instant it shows.
 */
export const draftIn = (instant: number, zone: string): string => {
  const wall = wallOf(instant, zone)
  const reading = writeWall(wall)
  return Option.contains(instantIn(reading, zone), instant)
    ? reading
    : `${reading}${writeOffset(utcOf(wall) - instant)}`
}
