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
  /** Formats whole digits with the locale's grouping, to compare a grouped draft against. */
  readonly grouped: Intl.NumberFormat
}

const minus = /^[-−]/
const space = /[\s  ]/g

const symbolsCache = new Map<string, Symbols>()

/** The symbols of `options` in `locale`, Latin digits always: a draft is typed on a keyboard. */
const symbolsOf = (locale: string, options: Intl.NumberFormatOptions): Symbols => {
  const key = JSON.stringify([locale, options])
  const known = symbolsCache.get(key)
  if (known !== undefined) return known
  const parts = new Intl.NumberFormat(locale, {
    ...options,
    numberingSystem: 'latn',
  }).formatToParts(-1234567.5)
  // The separators from a plain number that has both, whatever `options` shows:
  // a percentage with no decimals still has the locale's decimal separator.
  const separators = new Intl.NumberFormat(locale, {
    numberingSystem: 'latn',
    minimumFractionDigits: 1,
  }).formatToParts(1234567.5)
  const of = (type: Intl.NumberFormatPartTypes) =>
    separators.find(part => part.type === type)?.value
  const made: Symbols = {
    group: of('group') ?? ',',
    decimal: of('decimal') ?? '.',
    affixes: parts
      .filter(part => part.type === 'currency' || part.type === 'percentSign')
      .map(part => part.value),
    grouped: new Intl.NumberFormat(locale, {
      numberingSystem: 'latn',
      useGrouping: true,
      maximumFractionDigits: 0,
    }),
  }
  symbolsCache.set(key, made)
  return made
}

/**
 * The digits a draft names, in `locale` for amounts formatted with `options`:
 * none for text that is not an amount, has more than `scale` fraction digits,
 * groups its digits other than the locale does (`12,3` in `en-US` is no
 * thousand), or is negative where `negative` is false.
 */
export const readDigits = (
  draft: string,
  locale: string,
  options: Intl.NumberFormatOptions,
  scale: number,
  negative: boolean,
): Option.Option<Digits> => {
  const symbols = symbolsOf(locale, options)
  let text = draft
  for (const affix of symbols.affixes) text = text.split(affix).join('')
  // A locale that groups with a space groups with any space a person types.
  const spaced = space.test(symbols.group)
  text = text.trim()
  text = spaced ? text.replace(space, symbols.group) : text.replace(space, '')
  const signed = minus.test(text)
  if (signed) text = text.slice(1)
  if (signed && !negative) return Option.none()
  const [whole = '', fraction = '', ...rest] = text.split(symbols.decimal)
  if (rest.length > 0 || (whole === '' && fraction === '')) return Option.none()
  if (!/^\d*$/.test(fraction) || fraction.length > scale) return Option.none()
  const digits = whole.split(symbols.group).join('')
  if (!/^\d*$/.test(digits)) return Option.none()
  // Grouped only as the locale groups that number, or not at all.
  if (digits !== whole && symbols.grouped.format(BigInt(digits)) !== whole) return Option.none()
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
