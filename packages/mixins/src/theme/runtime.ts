/**
 * The run-time half of Themes: showing a named theme on the root element,
 * keeping the choice, and hearing another tab's. It imports no style code, so
 * a page built with `foldkit-mixins/vite`'s `modules` (no compiler in the
 * browser) can switch themes; `Themes.make` in `themes.ts` is the compiled
 * half and returns a `ThemeNames`. Which theme is active is the application's
 * Model's fact: `applyTheme` is the Command's effect that shows it,
 * `chooseTheme` shows it and keeps it, and `themeScript` shows the kept one
 * in the head of the next page before the first paint.
 */
import { Effect, Stream } from 'effect'
import { scriptLiteral } from './scriptLiteral.js'
import { storageChanges } from './storageChanges.js'

/** What the functions here need of a set of named themes: its names and where the active one is shown. */
export interface ThemeNames<Name extends string> {
  readonly names: ReadonlyArray<Name>
  readonly initial: Name
  /** The root element's attribute that names the active theme. */
  readonly attribute: string
}

/** The storage key a chosen theme's name is kept under, unless one is given. */
export const THEME_KEY = 'foldkit:theme'

/**
 * Shows `name` on the root element, as a Command's effect: the initial theme
 * removes the attribute, so the root's own declarations apply.
 */
export const applyTheme = <Name extends string>(
  themes: ThemeNames<Name>,
  name: NoInfer<Name>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const root = document.documentElement
    if (name === themes.initial) root.removeAttribute(themes.attribute)
    else root.setAttribute(themes.attribute, name)
  })

/**
 * The text of a `<script>` for the document's head: it shows the theme whose
 * name is kept under `key`, so a reader who chose one never sees the initial
 * theme for a frame. A kept name that is not one of `themes` (a theme a later
 * build removed), and storage that throws, leave the initial theme.
 */
export const themeScript = <Name extends string>(
  themes: ThemeNames<Name>,
  key: string = THEME_KEY,
): string =>
  `(function(){try{var n=localStorage.getItem(${scriptLiteral(key)});` +
  `if(${scriptLiteral(themes.names.filter(name => name !== themes.initial))}.indexOf(n)!==-1)` +
  `document.documentElement.setAttribute(${scriptLiteral(themes.attribute)},n)}catch(e){}})()`

/**
 * Shows `name`, as `applyTheme` does, and keeps it under `key` for the next
 * visit, as a Command's effect: the initial theme keeps nothing. Storage that
 * throws still shows it on this page.
 */
export const chooseTheme = <Name extends string>(
  themes: ThemeNames<Name>,
  name: NoInfer<Name>,
  key: string = THEME_KEY,
): Effect.Effect<void> =>
  applyTheme(themes, name).pipe(
    Effect.andThen(
      Effect.sync(() => {
        try {
          if (name === themes.initial) localStorage.removeItem(key)
          else localStorage.setItem(key, name)
        } catch {
          // Storage refused (a private window, a full quota): this visit keeps it.
        }
      }),
    ),
  )

/**
 * The theme another tab chose, each time it does: what its `chooseTheme` kept
 * under `key`, with a name no theme has, a removed key and anything else read
 * as the initial theme, as `themeScript` reads it. For a Subscription whose
 * Message the application's `update` stores and answers with `applyTheme`:
 * this tab's Model owns the chosen name, so the stream applies nothing itself.
 */
export const themeChanges = <Name extends string>(
  themes: ThemeNames<Name>,
  key: string = THEME_KEY,
): Stream.Stream<Name> =>
  storageChanges(key).pipe(
    Stream.map(value => themes.names.find(name => name === value) ?? themes.initial),
  )
