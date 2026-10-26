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
import { decimalText, digitsOf, readDigits, shifted, writeAmount, type Digits } from './number.js'
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

/** Whether an amount may be below zero. Default not: a minus is then refused, not dropped. */
export interface Signed {
  readonly negative?: boolean | undefined
}

/**
 * How an amount of money is stored. `minor` is an integer of the currency's
 * smallest unit (cents: `123456` for $1,234.56); `decimal` is a decimal text
 * (`'1234.56'`). The key's schema says which it holds; a value of the other form
 * is the schema's error, never rounded into it.
 */
export interface MoneyOptions extends Locale, Signed {
  /** An ISO 4217 code: `USD`, `EUR`, `JPY`. */
  readonly currency: string
  readonly unit: 'minor' | 'decimal'
}

type MoneyData = MoneyOptions & { readonly scale: number }

const currencyOf = (data: MoneyData) => ({ style: 'currency', currency: data.currency }) as const

/** Digits of an integer number of minor units, or none for one that is not a safe integer. */
const minorDigits = (value: number, scale: number): Option.Option<Digits> => {
  if (!Number.isSafeInteger(value)) return Option.none()
  const all = String(Math.abs(value)).padStart(scale + 1, '0')
  return Option.some({
    negative: value < 0,
    whole: all.slice(0, all.length - scale),
    fraction: all.slice(all.length - scale),
  })
}

/** The decimal text a stored amount of money stands for, or none for a value of the wrong form. */
const moneyText = (value: unknown, data: MoneyData): Option.Option<string> =>
  Option.map(
    Match.value(data.unit).pipe(
      Match.when('minor', () =>
        typeof value === 'number' ? minorDigits(value, data.scale) : Option.none(),
      ),
      Match.when('decimal', () =>
        typeof value === 'string' ? digitsOf(value, data.scale) : Option.none(),
      ),
      Match.exhaustive,
    ),
    decimalText,
  )

/** The value a typed amount of money stands for, in the stored form. */
const moneyValue = (digits: Digits, data: MoneyData): Option.Option<unknown> =>
  Match.value(data.unit).pipe(
    Match.when('decimal', () => Option.some<unknown>(decimalText(digits))),
    Match.when('minor', () => {
      const sign = digits.negative ? '-' : ''
      const minor = Number(BigInt(`${sign}${digits.whole}${digits.fraction}`))
      return Number.isSafeInteger(minor) ? Option.some<unknown>(minor) : Option.none()
    }),
    Match.exhaustive,
  )

const MoneyKind = Input.kind<MoneyData>('Money', {
  draft: 'text',
  parse: (draft, data) =>
    Option.getOrUndefined(
      Option.flatMap(
        readDigits(
          draft,
          data.locale ?? 'en',
          currencyOf(data),
          data.scale,
          data.negative === true,
        ),
        digits => moneyValue(digits, data),
      ),
    ),
  format: (value, data) =>
    Option.match(moneyText(value, data), {
      onNone: () => {
        throw new Error(
          `an amount of ${data.currency} in ${data.unit} units is ${data.unit === 'minor' ? 'an integer' : 'decimal text'} of at most ${data.scale} decimals, not ${JSON.stringify(value)}`,
        )
      },
      onSome: amount => writeAmount(amount, data.locale ?? 'en', currencyOf(data)),
    }),
  unparsed: 'Enter an amount',
})

const MoneyDisplay = Display.kind<MoneyData>('Money', {
  text: (data, value) =>
    Option.match(moneyText(value, data), {
      onNone: () => String(value),
      onSome: amount => writeAmount(amount, data.locale ?? 'en', currencyOf(data)),
    }),
})

/** A number with at most `scale` decimals, kept as a number. */
export interface DecimalOptions extends Locale, Signed {
  readonly scale: number
}

/** A number's decimal text with `scale` decimals, or none when that would round it. */
const fixed = (value: unknown, scale: number): Option.Option<string> => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Option.none()
  const text = value.toFixed(scale)
  return Number(text) === value ? Option.some(text) : Option.none()
}

const decimalOf = (data: DecimalOptions) => ({ maximumFractionDigits: data.scale }) as const

const DecimalKind = Input.kind<DecimalOptions>('Decimal', {
  draft: 'text',
  parse: (draft, data) =>
    Option.getOrUndefined(
      Option.map(
        readDigits(draft, data.locale ?? 'en', decimalOf(data), data.scale, data.negative === true),
        digits => Number(decimalText(digits)),
      ),
    ),
  format: (value, data) =>
    Option.match(fixed(value, data.scale), {
      onNone: () => {
        throw new Error(`a number of at most ${data.scale} decimals, not ${JSON.stringify(value)}`)
      },
      onSome: amount => writeAmount(amount, data.locale ?? 'en', decimalOf(data)),
    }),
  unparsed: 'Enter a number',
})

const DecimalDisplay = Display.kind<DecimalOptions>('Decimal', {
  text: (data, value) =>
    Option.match(fixed(value, data.scale), {
      onNone: () => String(value),
      onSome: amount => writeAmount(amount, data.locale ?? 'en', decimalOf(data)),
    }),
})

/**
 * A percentage, drawn as `12.5%`. `fraction` stores it as the share (`0.125`),
 * `points` as the number before the sign (`12.5`). `scale` is the decimals of
 * the percentage as shown (default 2).
 */
export interface PercentOptions extends Locale, Signed {
  readonly unit: 'fraction' | 'points'
  readonly scale?: number | undefined
}

const percentOf = (data: PercentOptions) =>
  ({ style: 'percent', maximumFractionDigits: data.scale ?? 2 }) as const

/** The share a stored percentage stands for, as decimal text, or none for one that would round. */
const shareText = (value: unknown, data: PercentOptions): Option.Option<string> => {
  const scale = data.scale ?? 2
  return Match.value(data.unit).pipe(
    Match.when('fraction', () => fixed(value, scale + 2)),
    Match.when('points', () =>
      Option.map(
        Option.flatMap(fixed(value, scale), points => digitsOf(points, scale)),
        points => decimalText(shifted(points, 2)),
      ),
    ),
    Match.exhaustive,
  )
}

const PercentKind = Input.kind<PercentOptions>('Percent', {
  draft: 'text',
  parse: (draft, data) =>
    Option.getOrUndefined(
      Option.map(
        readDigits(
          draft,
          data.locale ?? 'en',
          percentOf(data),
          data.scale ?? 2,
          data.negative === true,
        ),
        points =>
          Number(
            decimalText(
              Match.value(data.unit).pipe(
                Match.when('points', () => points),
                Match.when('fraction', () => shifted(points, 2)),
                Match.exhaustive,
              ),
            ),
          ),
      ),
    ),
  format: (value, data) =>
    Option.match(shareText(value, data), {
      onNone: () => {
        throw new Error(
          `a percentage of at most ${data.scale ?? 2} decimals, not ${JSON.stringify(value)}`,
        )
      },
      onSome: share => writeAmount(share, data.locale ?? 'en', percentOf(data)),
    }),
  unparsed: 'Enter a percentage',
})

const PercentDisplay = Display.kind<PercentOptions>('Percent', {
  text: (data, value) =>
    Option.match(shareText(value, data), {
      onNone: () => String(value),
      onSome: share => writeAmount(share, data.locale ?? 'en', percentOf(data)),
    }),
})

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
    Money: MoneyKind,
    Decimal: DecimalKind,
    Percent: PercentKind,
  },
  /** The display kinds, likewise. */
  Displays: {
    Date: DateDisplay,
    DateTime: DateTimeDisplay,
    Money: MoneyDisplay,
    Decimal: DecimalDisplay,
    Percent: PercentDisplay,
  },

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

  /**
   * An amount of money in `currency`, shown and read as `locale` writes it
   * (`$1,234.56`, `1.234,56 €`, `￥1,235`), with the currency's own decimals: none
   * for JPY, three for KWD. More decimals than that are refused, not rounded, and
   * grouping other than the locale's (`12,3`) is refused, not read as `123`. An
   * unknown currency code throws here.
   */
  money: (options: MoneyOptions): FieldRecipe<Control<MoneyData>> => {
    if (!/^[A-Z]{3}$/.test(options.currency))
      throw new Error(`FieldRecipes.money: "${options.currency}" is not an ISO 4217 code`)
    const scale =
      new Intl.NumberFormat(options.locale ?? 'en', {
        style: 'currency',
        currency: options.currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    const data = { ...options, scale }
    return { control: MoneyKind.of(data), display: MoneyDisplay.of(data) }
  },

  /** A number with at most `scale` decimals, read and shown in `locale`'s separators. */
  decimal: (options: DecimalOptions): FieldRecipe<Control<DecimalOptions>> => ({
    control: DecimalKind.of(options),
    display: DecimalDisplay.of(options),
  }),

  /** A percentage, stored as a share or as points (see `PercentOptions`). */
  percent: (options: PercentOptions): FieldRecipe<Control<PercentOptions>> => ({
    control: PercentKind.of(options),
    display: PercentDisplay.of(options),
  }),
}
