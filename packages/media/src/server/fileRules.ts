import { Option, Schema } from 'effect'
import { FileKey } from '../file.js'

// The rules a file upload and download are held to, apart from any I/O, so
// each can be tested and broken alone.

/** Whether a key is one the server could have minted, and so names nothing else in a store. */
export const isFileKey: (key: string) => boolean = Schema.is(FileKey)

const MAX_NAME_BYTES = 255

// Control, format (bidi marks and overrides, zero-width characters, U+061C,
// U+FEFF), line and paragraph separators, half a surrogate pair (which no
// header can carry, and which a download could not encode), and either slash.
const REFUSED_IN_NAME = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}/\\]/u

/** Whether a decoded name is one a download may carry. */
export const isFileName = (name: string): boolean =>
  name.length > 0 &&
  new TextEncoder().encode(name).length <= MAX_NAME_BYTES &&
  !REFUSED_IN_NAME.test(name)

/**
 * The file name a client sent, percent-encoded UTF-8, if it is one a
 * download may carry: non-empty, at most 255 bytes, and holding no control,
 * format or separator character and no slash. A malformed encoding is none.
 */
export const fileNameOf = (header: string | undefined): Option.Option<string> => {
  // Sent percent-encoded, so a raw byte past ASCII is a client that did not encode.
  if (header === undefined || !/^[\x20-\x7e]*$/.test(header)) return Option.none()
  let name: string
  try {
    name = decodeURIComponent(header)
  } catch {
    return Option.none()
  }
  return isFileName(name) ? Option.some(name) : Option.none()
}

const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+"
const MEDIA_TYPE = new RegExp(`^${TOKEN}/${TOKEN}$`)
const PATTERN = new RegExp(`^${TOKEN}/(?:${TOKEN}|\\*)$`)

/**
 * The `type/subtype` of a media type, lowercased, its parameters dropped:
 * `Text/HTML; x=image/png` is `text/html`. Anything outside the grammar is none.
 */
export const mediaTypeOf = (header: string | undefined): Option.Option<string> => {
  if (header === undefined) return Option.none()
  const essence = header.split(';', 1)[0]!.trim()
  return MEDIA_TYPE.test(essence) ? Option.some(essence.toLowerCase()) : Option.none()
}

/** What an upload route takes: media types or `type/*` patterns, or `'*'` for any type. */
export type Accept = '*' | ReadonlyArray<string>

/**
 * Whether `accept` takes a parsed media type (from `mediaTypeOf`). Throws for
 * a pattern outside the grammar, so a typo fails where the route is made
 * rather than refusing every upload.
 */
export const acceptor = (accept: Accept): ((type: string) => boolean) => {
  if (accept === '*') return () => true
  // An empty list would refuse every upload: no type at all is not a choice anyone means.
  if (accept.length === 0) throw new Error("accept lists no type: give one, or '*' for any")
  const patterns = accept.map(pattern => {
    // `*/*` would read as a pattern and take nothing: any type is `'*'`, said so.
    if (!PATTERN.test(pattern) || pattern.startsWith('*/'))
      throw new Error(`"${pattern}" is not a media type or type/* pattern`)
    return pattern.toLowerCase()
  })
  return type =>
    patterns.some(pattern =>
      pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern,
    )
}

// What a download carries on every answer, refusals included: nothing on
// the application's origin may run it, read it from another site, or keep it.
const SERVED: Readonly<Record<string, string>> = {
  'content-type': 'application/octet-stream',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'private, no-store',
}

/**
 * `Content-Disposition: attachment` with the name twice: as RFC 6266's
 * `filename*`, everything outside RFC 5987's attribute characters
 * percent-encoded, and as an ASCII fallback keeping letters, digits, space,
 * `.`, `_` and `-` (so no `"`, `\` or `%`, which Chromium decodes there).
 */
export const dispositionOf = (name: string): string => {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  const fallback = name.replace(/[^A-Za-z0-9 ._-]/gu, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/** A download's headers: a file's, named, or a refusal's, with none. */
export const fileHeaders = (name: Option.Option<string>): Readonly<Record<string, string>> =>
  Option.match(name, {
    onNone: () => SERVED,
    onSome: name => ({ ...SERVED, 'content-disposition': dispositionOf(name) }),
  })
