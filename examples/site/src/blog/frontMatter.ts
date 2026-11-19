/**
 * A post's front matter: the block between the `---` lines that open its
 * file, read strictly. The site depends on no YAML library, so only the two
 * forms a post uses are read: `key: value` (the value is the rest of the line,
 * optionally in one pair of quotes, with no escapes) and `key: [a, b]` for a
 * list. Anything else, such as a value on the next line, fails the build with
 * the file's name rather than reading as something it was not.
 */
import { Result, Schema } from 'effect'

/** A day, `2026-11-18`, that exists on the calendar. */
const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)).check(
  Schema.makeFilter(
    value =>
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) || `${value} is not a date`,
  ),
)

const Text = Schema.String.check(Schema.isMinLength(1))

/** Every key a post may have; a key not named here is refused. */
export const FrontMatter = Schema.Struct({
  title: Text,
  /** One or two sentences: the page's meta description and the index's summary. */
  description: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(300)),
  date: Day,
  author: Text,
  updated: Schema.optionalKey(Day),
  /** A PNG under the site's `public/` folder, as the site serves it: `/blog/og/card.png`. */
  image: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\/[^?#\s]+\.png$/))),
  tags: Schema.Array(Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/))),
})
export type FrontMatter = typeof FrontMatter.Type

const decode = Schema.decodeUnknownResult(FrontMatter, { onExcessProperty: 'error' })

export interface Parsed {
  readonly data: FrontMatter
  /** The Markdown after the front matter. */
  readonly body: string
}

const fail = (file: string, problem: string): never => {
  throw new Error(`${file}: ${problem}`)
}

const unquoted = (value: string): string =>
  value.length >= 2 && '"\''.includes(value[0]!) && value.endsWith(value[0]!)
    ? value.slice(1, -1)
    : value

const valueOf = (file: string, line: number, raw: string): string | ReadonlyArray<string> => {
  const value = raw.trim()
  if (!value.startsWith('[')) return unquoted(value)
  if (!value.endsWith(']')) return fail(file, `line ${line}: a list is closed by ] on its own line`)
  const inside = value.slice(1, -1).trim()
  return inside === '' ? [] : inside.split(',').map(item => unquoted(item.trim()))
}

/** `text`'s front matter and the Markdown after it; `file` names it in every error. */
export const parse = (file: string, text: string): Parsed => {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (lines[0] !== '---') return fail(file, 'a post starts with front matter: a line of ---')
  const end = lines.indexOf('---', 1)
  if (end === -1) return fail(file, 'the front matter is never closed by a line of ---')
  const entries = new Map<string, string | ReadonlyArray<string>>()
  lines.slice(1, end).forEach((line, at) => {
    if (line.trim() === '') return
    const colon = line.indexOf(':')
    const key = line.slice(0, colon).trim()
    if (colon === -1 || key === '' || /\s/.test(key))
      return fail(file, `line ${at + 2} is not "key: value"`)
    if (entries.has(key)) return fail(file, `line ${at + 2}: ${key} is given twice`)
    entries.set(key, valueOf(file, at + 2, line.slice(colon + 1)))
  })
  const decoded = decode(Object.fromEntries(entries))
  if (Result.isFailure(decoded)) return fail(file, decoded.failure.message)
  const data = decoded.success
  if (data.updated !== undefined && data.updated < data.date)
    return fail(file, `updated ${data.updated} is before date ${data.date}`)
  return { data, body: lines.slice(end + 1).join('\n') }
}
