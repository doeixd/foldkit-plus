/**
 * `foldkit-form-recipes` — field recipes for `foldkit-form`.
 *
 * A recipe is the meaning of one kind of key: a control that reads a draft into
 * the key's value and shows a value as a draft, and a display that reads the
 * value in a list or a detail. Both are values made from the same options, so
 * a date reads the same in its field and in its table cell. This entry draws
 * nothing; `./html` holds the renderers.
 */
import { Match, Option } from 'effect'
import { Display } from 'foldkit-crud'
import { Input, type Control, type ControlChange } from 'foldkit-form'
import { isCalendarDate, type CalendarDate } from 'foldkit/calendar'
import { instantOf, knownZone, readWall, wallOf, writeWall } from './wall.js'

/**
 * One kind of key: how it is edited, and how it reads. Most recipes' control is
 * a `Control`; one that follows another key (`slug`) is a `ControlChange`, which
 * only a form's `inputs` takes.
 */
export interface FieldRecipe<C extends Control<any> | ControlChange = Control> {
  /** For a form's `inputs`, or (a `Control`) for Entity metadata through `Input.of`. */
  readonly control: C
  /** For Entity metadata through `Display.of`: how a list or a detail shows the value. */
  readonly display: Display
}

/** What a display says a date or a time in: a BCP 47 locale. Default `en`. */
export interface Locale {
  readonly locale?: string | undefined
}

const two = (value: number) => String(value).padStart(2, '0')

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/

/** The calendar date `YYYY-MM-DD` names, or `undefined` for text that names none. */
const readDate = (text: string): CalendarDate | undefined => {
  const parts = isoDate.exec(text)
  if (parts === null) return undefined
  const date = { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]) }
  return isCalendarDate(date) ? date : undefined
}

const writeDate = (date: CalendarDate): string =>
  `${String(date.year).padStart(4, '0')}-${two(date.month)}-${two(date.day)}`

const DateKind = Input.kind<Locale>('Date', {
  draft: 'text',
  parse: draft => readDate(draft),
  format: value => {
    if (isCalendarDate(value)) return writeDate(value)
    throw new Error(`a date is a CalendarDate, not ${JSON.stringify(value)}`)
  },
  unparsed: 'Enter a date',
})

const DateDisplay = Display.kind<Locale>('Date', {
  text: (data, value) =>
    isCalendarDate(value)
      ? new Intl.DateTimeFormat(data.locale ?? 'en', {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }).format(Date.UTC(value.year, value.month - 1, value.day))
      : String(value),
})

/**
 * How a moment is stored. `local` is the wall-clock text a `datetime-local`
 * input writes (`2026-10-26T09:30`), in no zone: the key's value is that text.
 * `instant` is an ISO instant (`2026-10-26T09:30:00.000Z`), read and shown as
 * the clocks in `zone` (an IANA name) read it.
 */
export type Stored =
  | { readonly stored: 'local' }
  | { readonly stored: 'instant'; readonly zone: string }

type DateTimeData = Stored & Locale

/** How one stored form reads a typed reading, shows a value, and says it in a list. */
interface Mode {
  readonly parse: (draft: string) => Option.Option<string>
  readonly format: (value: unknown) => string
  readonly text: (value: string, locale: string) => string
}

const shown = { dateStyle: 'medium', timeStyle: 'short' } as const
const instantText = /(?:Z|[+-]\d\d:\d\d)$/

const local: Mode = {
  // The text as typed, once it names a real time: a stored value comes back unchanged.
  parse: draft => Option.as(readWall(draft), draft),
  format: value => {
    if (typeof value === 'string' && Option.isSome(readWall(value))) return value
    throw new Error(
      `a local date and time is text such as 2026-10-26T09:30, not ${JSON.stringify(value)}`,
    )
  },
  text: (value, locale) =>
    Option.match(readWall(value), {
      onNone: () => value,
      onSome: wall =>
        new Intl.DateTimeFormat(locale, { ...shown, timeZone: 'UTC' }).format(
          Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
        ),
    }),
}

const instant = (zone: string): Mode => ({
  parse: draft =>
    Option.map(
      Option.flatMap(readWall(draft), wall => instantOf(wall, zone)),
      at => new Date(at).toISOString(),
    ),
  format: value => {
    const at = typeof value === 'string' && instantText.test(value) ? Date.parse(value) : Number.NaN
    if (!Number.isNaN(at)) return writeWall(wallOf(at, zone))
    throw new Error(`an instant is ISO text with an offset, not ${JSON.stringify(value)}`)
  },
  text: (value, locale) => {
    const at = Date.parse(value)
    return Number.isNaN(at)
      ? value
      : new Intl.DateTimeFormat(locale, { ...shown, timeZone: zone }).format(at)
  },
})

const modeOf = (data: Stored): Mode =>
  Match.value(data).pipe(
    Match.discriminatorsExhaustive('stored')({
      local: () => local,
      instant: ({ zone }) => instant(zone),
    }),
  )

const DateTimeKind = Input.kind<DateTimeData>('DateTime', {
  draft: 'text',
  parse: (draft, data) => Option.getOrUndefined(modeOf(data).parse(draft)),
  format: (value, data) => modeOf(data).format(value),
  unparsed: 'Enter a date and a time that exists',
})

const DateTimeDisplay = Display.kind<DateTimeData>('DateTime', {
  text: (data, value) => modeOf(data).text(String(value), data.locale ?? 'en'),
})

/** What the browser may fill a text-shaped key with: an `autocomplete` token. */
export interface Autofill {
  readonly autocomplete?: string | undefined
}

// One `@`, something either side, no space: an address, without guessing at
// what a server will deliver to. Whether it exists is the server's to say.
const address = /^[^\s@]+@[^\s@]+$/

const EmailKind = Input.kind<Autofill>('Email', {
  draft: 'text',
  parse: draft => (address.test(draft) ? draft : undefined),
  unparsed: 'Enter an email address',
})

/** Which schemes a web address may have. Default `https:` and `http:`. */
export interface Schemes extends Autofill {
  readonly protocols?: ReadonlyArray<string> | undefined
}

const UrlKind = Input.kind<Schemes>('Url', {
  draft: 'text',
  // Kept as typed, once it parses with an allowed scheme: a reader's spelling is
  // not rewritten, and `javascript:` is not a link.
  parse: (draft, data) => {
    if (!URL.canParse(draft)) return undefined
    return (data.protocols ?? ['https:', 'http:']).includes(new URL(draft).protocol)
      ? draft
      : undefined
  },
  unparsed: 'Enter a web address, starting https://',
})

// A telephone number is too varied to check here without refusing a real one;
// the schema may, and the kind gives the keypad and the autofill.
const TelKind = Input.kind<Autofill>('Tel', { draft: 'text' })

/** Whether the password is one the person has (`current`) or is choosing (`new`). */
export interface Purpose {
  readonly purpose: 'current' | 'new'
}

const PasswordKind = Input.kind<Purpose>('Password', { draft: 'text' })

/** A slug's address before it: `/blog/`. */
export interface Prefix {
  readonly prefix: string
}

const SlugKind = Input.kind<Prefix>('Slug', { draft: 'text' })

const slugify = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const text = Display.text()

export const FieldRecipes = {
  /** The control kinds, so a renderer table is keyed by them and `is` narrows a control. */
  Kinds: {
    Date: DateKind,
    DateTime: DateTimeKind,
    Email: EmailKind,
    Url: UrlKind,
    Tel: TelKind,
    Password: PasswordKind,
    Slug: SlugKind,
  },
  /** The display kinds, likewise. */
  Displays: { Date: DateDisplay, DateTime: DateTimeDisplay },

  /**
   * A calendar date: a key whose value is a `CalendarDate` (`Calendar.CalendarDate`,
   * or `Calendar.CalendarDateFromIsoString` to store it as text), edited as the
   * `YYYY-MM-DD` a date input writes. A partly typed date reads `Enter a date`.
   */
  date: (options: Locale = {}): FieldRecipe<Control<Locale>> => ({
    control: DateKind.of(options),
    display: DateDisplay.of(options),
  }),

  /**
   * A date and a time, stored as `options.stored` says (see `Stored`). With
   * `instant`, a time the zone's clocks skip is refused, and one they repeat
   * reads as the earlier of the two. An unknown zone throws here.
   */
  dateTime: (options: Stored & Locale): FieldRecipe<Control<DateTimeData>> => {
    if (options.stored === 'instant') knownZone(options.zone, 'FieldRecipes.dateTime')
    return { control: DateTimeKind.of(options), display: DateTimeDisplay.of(options) }
  },

  /**
   * An email address: one `@` with something either side and no space, kept as
   * typed (neither trimmed nor lower-cased: a local part may be case-sensitive).
   */
  email: (options: Autofill = {}): FieldRecipe<Control<Autofill>> => ({
    control: EmailKind.of(options),
    display: text,
  }),

  /** A web address with one of `options.protocols`, kept as typed. */
  url: (options: Schemes = {}): FieldRecipe<Control<Schemes>> => ({
    control: UrlKind.of(options),
    display: text,
  }),

  /** A telephone number, as typed: the phone's keypad and the browser's autofill, no check. */
  tel: (options: Autofill = {}): FieldRecipe<Control<Autofill>> => ({
    control: TelKind.of(options),
    display: text,
  }),

  /**
   * A password, drawn masked and named for the browser's password manager by
   * `purpose`. It never shows in a list. Keep it out of any saved draft: a form
   * cannot leave a key out of `partial()`, so that rule is the application's.
   */
  password: (options: Purpose): FieldRecipe<Control<Purpose>> => ({
    control: PasswordKind.of(options),
    display: Display.hidden(),
  }),

  /**
   * An address that follows the key `from` (made into a slug) until the person
   * writes it, shown after `prefix`. A form filled with a stored slug does not
   * follow it: a published address must not move because its title did.
   */
  slug: (
    from: string,
    options: { readonly prefix?: string; readonly through?: (text: string) => string } = {},
  ): FieldRecipe<ControlChange> => ({
    control: {
      change: (resolved, inputKey) => {
        const following = Input.following(from, options.through ?? slugify).change(
          resolved,
          inputKey,
        )
        return Object.freeze({
          ...SlugKind.of({ prefix: options.prefix ?? '/' }),
          follows: following.follows,
        })
      },
    },
    display: text,
  }),

  /** Text as an address: lower case, unaccented, words joined by `-`. What `slug` follows with. */
  slugify,
}
