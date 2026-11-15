/**
 * Showing, keeping and hearing the chosen theme, in the browser.
 *
 * ADOPT: delete this module for `Themes.choose`, `Themes.script` and
 * `themeChanges` from `foldkit-mixins/theme` once they are importable without
 * the style compiler. Today they sit beside `Themes.make`, and any client that
 * imports them is refused by `foldkit-mixins/vite`'s `modules`, which this page
 * relies on to ship no compiler. The names, the attribute and the storage key
 * come from the generated `themeData.ts`, so what is written here is the
 * mechanism only, the same one `foldkit-mixins/theme/themes.ts` uses.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { initialTheme, themeAttribute, themeKey, themeNames } from './themeData.js'

export const ThemeName = Schema.Literals(themeNames)
export type ThemeName = typeof ThemeName.Type

const named = (value: string | null): ThemeName =>
  themeNames.find(name => name === value) ?? initialTheme

/** Shows `name` on the root and keeps it for the next visit; the initial theme keeps nothing. */
export const chooseTheme = (name: ThemeName): Effect.Effect<void> =>
  Effect.sync(() => {
    const root = document.documentElement
    if (name === initialTheme) root.removeAttribute(themeAttribute)
    else root.setAttribute(themeAttribute, name)
    try {
      if (name === initialTheme) localStorage.removeItem(themeKey)
      else localStorage.setItem(themeKey, name)
    } catch {
      // Storage refused (a private window): this visit keeps it.
    }
  })

/** The kept theme, shown before the first paint; the entry calls it before the sheet loads. */
export const showKeptTheme = (): ThemeName => {
  let kept: string | null = null
  try {
    kept = localStorage.getItem(themeKey)
  } catch {
    // Storage refused: the initial theme.
  }
  const name = named(kept)
  if (name !== initialTheme) document.documentElement.setAttribute(themeAttribute, name)
  return name
}

/** The theme another tab chose, each time it does. */
export const themeChanges: Stream.Stream<ThemeName> = Stream.callback<string | null>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (event: StorageEvent) => {
        if (event.key !== null && event.key !== themeKey) return
        try {
          if (event.storageArea !== window.localStorage) return
        } catch {
          return
        }
        Queue.offerUnsafe(queue, event.newValue)
      }
      window.addEventListener('storage', listener)
      return listener
    }),
    listener => Effect.sync(() => window.removeEventListener('storage', listener)),
  ),
).pipe(Stream.map(named))
