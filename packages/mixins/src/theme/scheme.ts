/**
 * A reader's light or dark choice, kept across visits and applied before the
 * first paint. A palette of `lightDark` tokens follows `color-scheme`, so the
 * choice is that one property on the root element: `'system'` leaves the
 * stylesheet's `light dark`, and the browser follows the operating system.
 */
import { Effect } from 'effect'
import { scriptLiteral } from './scriptLiteral.js'

/** What a reader may choose: a scheme, or the operating system's. */
export type Scheme = 'light' | 'dark' | 'system'

/** The storage key a chosen scheme is kept under, unless one is given. */
export const SCHEME_KEY = 'foldkit:color-scheme'

const stored = (value: string | null): value is 'light' | 'dark' =>
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
