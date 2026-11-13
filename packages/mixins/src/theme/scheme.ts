/**
 * A reader's light or dark choice, kept across visits and applied before the
 * first paint. A palette of `lightDark` tokens follows `color-scheme`, so the
 * choice is that one property on the root element: `'system'` leaves the
 * stylesheet's `light dark`, and the browser follows the operating system.
 */
import { Effect, Option, Stream } from 'effect'
import { scriptLiteral } from './scriptLiteral.js'
import { storageChanges } from './storageChanges.js'

/** What a reader may choose: a scheme, or the operating system's. */
export type Scheme = 'light' | 'dark' | 'system'

/** The storage key a chosen scheme is kept under, unless one is given. */
export const SCHEME_KEY = 'foldkit:color-scheme'

const stored = (value: string | null | undefined): value is 'light' | 'dark' =>
  value === 'light' || value === 'dark'

/**
 * The text of a `<script>` for the document's head, before any stylesheet
 * draws: it applies the scheme kept under `key`, so a reader who chose dark
 * never sees one light frame. Storage that throws (a private window) or holds
 * anything else leaves the stylesheet's choice.
 */
export const schemeScript = (key: string = SCHEME_KEY): string =>
  `(function(){try{var s=localStorage.getItem(${scriptLiteral(key)});if(s==='light'||s==='dark')document.documentElement.style.colorScheme=s}catch(e){}})()`

/** The scheme the root element shows now: what `schemeScript` or `chooseScheme` applied. */
export const currentScheme = (): Scheme => {
  if (typeof document === 'undefined') return 'system'
  const applied = document.documentElement.style.colorScheme
  return stored(applied) ? applied : 'system'
}

/**
 * Applies `scheme` to the root element and keeps it under `key` for the next
 * visit, as a Command's effect. `'system'` removes both. Storage that throws
 * still applies the scheme to this page.
 */
export const chooseScheme = (scheme: Scheme, key: string = SCHEME_KEY): Effect.Effect<void> =>
  Effect.sync(() => {
    const root = document.documentElement
    if (scheme === 'system') root.style.removeProperty('color-scheme')
    else root.style.colorScheme = scheme
    try {
      if (scheme === 'system') localStorage.removeItem(key)
      else localStorage.setItem(key, scheme)
    } catch {
      // Storage refused (a private window, a full quota): this visit keeps it.
    }
  })

/**
 * The scheme another tab chose, each time it does: what its `chooseScheme`
 * kept under `key`, with a removed key or anything else read as `'system'`,
 * as `schemeScript` reads it. For a Subscription whose Message the
 * application's `update` stores and answers with `chooseScheme`: this tab's
 * Model owns the choice, so the stream applies nothing itself.
 */
export const schemeChanges = (key: string = SCHEME_KEY): Stream.Stream<Scheme> =>
  storageChanges(key).pipe(Stream.map(value => (stored(value) ? value : 'system')))

/**
 * The response headers that make a browser send `Sec-CH-Prefers-Color-Scheme`
 * from its first request: `Accept-CH` opts in, `Critical-CH` has the browser
 * retry the first request with the hint, and `Vary` keeps a cache from serving
 * one scheme's page to the other.
 */
export const COLOR_SCHEME_HINT_HEADERS = {
  'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
  'Critical-CH': 'Sec-CH-Prefers-Color-Scheme',
  Vary: 'Sec-CH-Prefers-Color-Scheme',
} as const

/**
 * The scheme a `Sec-CH-Prefers-Color-Scheme` request header reports, for a
 * server that builds the Model per request, or none for an absent or unknown
 * value. The hint is a quoted string (`"dark"`); an unquoted one is read too.
 */
export const schemeOfHint = (
  header: string | null | undefined,
): Option.Option<'light' | 'dark'> => {
  const value = header?.trim().replace(/^"(.*)"$/, '$1')
  return stored(value) ? Option.some(value) : Option.none()
}
