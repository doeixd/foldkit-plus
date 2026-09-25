/**
 * A URL a stored Document may hold: a link's `href`, an image's `src`.
 *
 * A Document is untrusted input, so a URL is a type, not a string. It accepts
 * `https:`, `http:`, `mailto:` and `tel:`, and relative URLs, and refuses every
 * other scheme, `javascript:`, `data:` and `vbscript:` included. The scheme is
 * read the way a browser reads it: control characters and whitespace removed,
 * case folded, so `JaVa\tScRiPt:` is refused too.
 */
import { Schema } from 'effect'

const allowed = new Set(['http', 'https', 'mailto', 'tel'])

/** The scheme a browser would read, or `undefined` for a relative URL. */
const schemeOf = (value: string): string | undefined =>
  /^([a-z][a-z0-9+.-]*):/.exec(
    // eslint-disable-next-line no-control-regex
    value.replace(/[\u0000- \u007f]/g, '').toLowerCase(),
  )?.[1]

/** Whether a browser following this URL would stay on a scheme a Document may use. */
export const isSafeUrl = (value: string): boolean => {
  const scheme = schemeOf(value)
  return scheme === undefined || allowed.has(scheme)
}

export const Url = Schema.String.check(
  Schema.makeFilter(
    value =>
      isSafeUrl(value) ||
      `"${value}" is not a URL a page may hold: only http, https, mailto, tel and relative URLs are`,
  ),
).pipe(Schema.brand('@foldkit-composition/Url'))
export type Url = typeof Url.Type
