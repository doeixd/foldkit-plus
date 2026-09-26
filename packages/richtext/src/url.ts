/**
 * The URL policy every importer shares (§70, §124 §10). A link's `href` and an image's `src`
 * arrive from pasted HTML or Markdown, which is untrusted, and the standard rendering writes
 * them into attributes, so each passes here before it can become a prop.
 */

/** Schemes a link or a source may carry; anything else — `javascript:`, `data:` — is refused. */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

/**
 * A URL safe to carry into props, or `undefined` when it is not. Control characters are
 * removed first, because `java\tscript:` and a leading NUL are how a scheme check is
 * usually walked past; then a URL that names a scheme outside the allowlist is refused,
 * and one with no scheme — a relative path, a fragment, a protocol-relative URL — is
 * kept. The value is never interpreted, only copied, so what a policy leaves through is
 * still the application's to trust.
 */
export const safeUrl = (value: string | null): string | undefined => {
  if (value === null) return undefined
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (cleaned.length === 0) return undefined
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(cleaned)?.[1]?.toLowerCase()
  return scheme === undefined || SAFE_SCHEMES.has(scheme) ? cleaned : undefined
}
