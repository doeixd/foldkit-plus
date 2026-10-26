/**
 * Reading and writing amounts as a locale writes them, without floating point:
 * a typed amount becomes its digits and sign, and an amount is written from a
 * decimal text, which `Intl.NumberFormat` formats exactly. Conservative by
 * design: a draft that could mean two things is refused, never guessed at.
 */
import { Option } from 'effect'

/** An amount read from a draft: its sign, whole digits, and exactly `scale` fraction digits. */
export interface Digits {
  readonly negative: boolean
  readonly whole: string
  readonly fraction: string
}

/** What a locale writes around and between the digits of one kind of amount. */
interface Symbols {
  readonly group: string
  readonly decimal: string
  /** Text that is not part of the amount: a currency symbol, a percent sign. */
  readonly affixes: ReadonlyArray<string>
  /** Whole digits grouped as this kind of amount groups them, to compare a grouped draft against. */
  readonly grouped: (digits: string) => string
}

const minus = /^[-−]/
const apostrophe = /^['’]$/
const apostrophes = /['’]/g
const spaces = /[\s\u00a0\u202f]/
const allSpaces = /[\s\u00a0\u202f]/g
/** Marks a format writes and a person does not type: bidi marks around an amount in rtl locales. */
const invisible = /\p{Cf}/gu

const symbolsCache = new Map<string, Symbols>()

/**
 * The symbols of `options` in `locale`, Latin digits always: a draft is typed on
 * a keyboard. All of them from the format the field writes with: a currency or a
 * percentage can group, and separate decimals, otherwise than a plain number
 * (`de-AT`'s euros group with `.`, its plain numbers with a space).
 */
const symbolsOf = (locale: string, options: Intl.NumberFormatOptions): Symbols => {
  const key = JSON.stringify([locale, options])
  const known = symbolsCache.get(key)
  if (known !== undefined) return known
  const parts = new Intl.NumberFormat(locale, {
    ...options,
    numberingSystem: 'latn',
    // One decimal, whatever the field's own: a yen amount still has a decimal separator.
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(-1234567.5)
  const of = (type: Intl.NumberFormatPartTypes) => parts.find(part => part.type === type)?.value
  // A percentage's whole digits are grouped as a number: its format would scale them.
  const whole = new Intl.NumberFormat(locale, {
    ...options,
    ...(options.style === 'percent' ? { style: 'decimal' } : {}),
    numberingSystem: 'latn',
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  // In their compatibility forms, as a draft is read: the full-width `￥` a
  // format writes is the `¥` a keyboard types.
  const made: Symbols = {
    group: (of('group') ?? ',').normalize('NFKC'),
    decimal: (of('decimal') ?? '.').normalize('NFKC'),
    affixes: parts
      .filter(part => part.type === 'currency' || part.type === 'percentSign')
      .map(part => part.value.normalize('NFKC')),
    grouped: digits =>
      whole
        .formatToParts(BigInt(digits))
        .filter(part => part.type === 'integer' || part.type === 'group')
        .map(part => part.value)
        .join('')
        .normalize('NFKC'),
  }
  symbolsCache.set(key, made)
  return made
}

/**
 * The digits a draft names, in `locale` for amounts formatted with `options`:
 * none for text that is not an amount, has more than `scale` fraction digits,
 * groups its digits other than the locale does (`12,3` in `en-US` is no
 * thousand), or is negative where `negative` is false. A currency symbol or a
 * percent sign is taken at either end only, and a minus before or after it.
 */
export const readDigits = (
  draft: string,
  locale: string,
  options: Intl.NumberFormatOptions,
  scale: number,
  negative: boolean,
): Option.Option<Digits> => {
  const symbols = symbolsOf(locale, options)
  let text = draft.normalize('NFKC').replace(invisible, '').trim()
  let signed = false
  for (let moved = true; moved;) {
    moved = false
    if (!signed && minus.test(text)) {
      signed = true
      text = text.slice(1).trim()
      moved = true
    }
    for (const affix of symbols.affixes) {
      if (text.startsWith(affix)) {
        text = text.slice(affix.length).trim()
        moved = true
      }
      if (text.endsWith(affix)) {
        text = text.slice(0, -affix.length).trim()
        moved = true
      }
    }
  }
  if (signed && !negative) return Option.none()
  // A locale that groups with a space groups with any space a person types; in
  // one that does not, a space inside an amount is no part of it.
  if (spaces.test(symbols.group)) text = text.replace(allSpaces, symbols.group)
  else if (spaces.test(text)) return Option.none()
  // Swiss grouping is an apostrophe, `’` or `'` as the runtime's ICU writes it
  // (ICU 78 moved to `'`), and a person types either.
  if (apostrophe.test(symbols.group)) text = text.replace(apostrophes, symbols.group)
  const [whole = '', fraction = '', ...rest] = text.split(symbols.decimal)
  if (rest.length > 0 || (whole === '' && fraction === '')) return Option.none()
  if (!/^\d*$/.test(fraction) || fraction.length > scale) return Option.none()
  const digits = whole.split(symbols.group).join('')
  if (!/^\d*$/.test(digits)) return Option.none()
  // Grouped only as the locale groups that number, or not at all.
  if (digits !== whole && symbols.grouped(digits) !== whole) return Option.none()
  return Option.some({
    negative: signed,
    whole: digits.replace(/^0+(?=\d)/, '') || '0',
    fraction: fraction.padEnd(scale, '0'),
  })
}

/** Digits as a decimal text `Intl.NumberFormat` reads exactly: `-1234.50`. Zero has no sign. */
export const decimalText = ({ negative, whole, fraction }: Digits): string => {
  const unsigned = fraction === '' ? whole : `${whole}.${fraction}`
  return negative && /[1-9]/.test(unsigned) ? `-${unsigned}` : unsigned
}

const decimalPattern = /^(-?)(\d+)(?:\.(\d+))?$/

/** The digits of a decimal text, with exactly `scale` fraction digits, or none for text with more. */
export const digitsOf = (text: string, scale: number): Option.Option<Digits> => {
  const parts = decimalPattern.exec(text)
  if (parts === null) return Option.none()
  const [, sign, whole = '0', fraction = ''] = parts
  if (fraction.replace(/0+$/, '').length > scale) return Option.none()
  return Option.some({
    negative: sign === '-',
    whole: whole.replace(/^0+(?=\d)/, ''),
    fraction: fraction.slice(0, scale).padEnd(scale, '0'),
  })
}

/** Moves the decimal point `places` to the left (`12.5`, 2 → `0.125`), as text. */
export const shifted = (digits: Digits, places: number): Digits => {
  const all = (digits.whole + digits.fraction).padStart(digits.fraction.length + places + 1, '0')
  const point = all.length - digits.fraction.length - places
  return {
    negative: digits.negative,
    whole: all.slice(0, point).replace(/^0+(?=\d)/, ''),
    fraction: all.slice(point),
  }
}

const formatCache = new Map<string, Intl.NumberFormat>()

/** Writes a decimal text as `locale` writes amounts formatted with `options`. */
export const writeAmount = (
  text: string,
  locale: string,
  options: Intl.NumberFormatOptions,
): string => {
  const key = JSON.stringify([locale, options])
  const known = formatCache.get(key)
  const format = known ?? new Intl.NumberFormat(locale, { ...options, numberingSystem: 'latn' })
  if (known === undefined) formatCache.set(key, format)
  // A string is formatted exactly (ECMA-402 2023), with no rounding through a
  // double; the ES2022 library this builds against types only number and bigint.
  return format.format(text as unknown as number)
}
