/**
 * Themes installed by name. A theme of typed knobs (`Theme.make`) holds only
 * knob values, and every token derives from knob variables, so one set of
 * derivations serves every theme: the root declares them with the initial
 * theme's knobs, and each other theme writes its knobs under
 * `:root[data-theme="name"]`, the same element, where the derivations resolve
 * them. Which theme is active is the application's Model's fact; `apply` is
 * the Command's effect that shows it, and `choose` shows it and keeps it,
 * for `script` to show in the head of the next page before the first paint.
 */
import { Effect, Schema } from 'effect'
import { global, type StyleValue } from '../styleValue.js'
import { compose, VAR_PREFIX, type ThemeTokens } from './core.js'
import {
  make as makeTheme,
  tokensOf,
  variables,
  type KnobSet,
  type KnobTheme,
  type Standard,
} from './knobs.js'
import { palette, type Palette } from './oklch.js'
import { scriptLiteral } from './scriptLiteral.js'
import { tokens, type Tokens } from './tokens.js'

/** Every shipped token: the scales, the palette, and the knobs they read. */
export type StandardTokens = ReturnType<typeof compose<Tokens, Palette>>

const shipped = compose(tokens, palette)

/**
 * Every shipped token with `theme`'s knob values, for a page's root: the
 * derivations are the same for every theme, so only the knobs differ. With
 * no theme, every knob at its default.
 */
export const standardOf = (theme: KnobTheme<Standard> = makeTheme({})): StandardTokens =>
  compose(shipped, tokensOf(theme))

const declarations = (theme: ThemeTokens) =>
  Object.entries(theme)
    .flatMap(([group, names]) =>
      Object.entries(names).map(([name, value]) => `${VAR_PREFIX}-${group}-${name}:${value}`),
    )
    .join(';')

const knobRule = (selector: string, theme: KnobTheme<KnobSet>) =>
  `${selector}{${Object.entries(variables(theme))
    .map(([name, value]) => `${VAR_PREFIX}-knob-${name}:${value}`)
    .join(';')}}`

/** A set of named themes, one of them shown until the Model chooses another. */
export interface Themes<Name extends string> {
  /** The names, as a Schema for the Model field that holds the active one. */
  readonly Name: Schema.Literals<ReadonlyArray<Name>>
  readonly names: ReadonlyArray<Name>
  readonly initial: Name
  /** The root element's attribute that names the active theme. */
  readonly attribute: string
  readonly theme: (name: Name) => KnobTheme<Standard>
  /** Every token with the initial theme's knobs: what the root declares, and what `t` reads. */
  readonly root: StandardTokens
  /** Each other theme's knobs, under its attribute on the root element, for the `theme` layer. */
  readonly scoped: StyleValue
}

/**
 * `themes` installed by their keys, `initial` shown until the Model chooses
 * another. A name is a key, so it is unique, and `Name` is the Schema of the
 * Model field that holds the active one.
 */
export const make = <const Record extends { readonly [name: string]: KnobTheme<Standard> }>(
  themes: Record,
  options: { readonly initial: keyof Record & string; readonly attribute?: string },
): Themes<keyof Record & string> => {
  const names = Object.keys(themes) as ReadonlyArray<keyof Record & string>
  const attribute = options.attribute ?? 'data-theme'
  const theme = (name: keyof Record & string) => themes[name]!
  return {
    Name: Schema.Literals(names),
    names,
    initial: options.initial,
    attribute,
    theme,
    root: standardOf(theme(options.initial)),
    scoped: global(
      names
        .filter(name => name !== options.initial)
        .map(name => knobRule(`:root[${attribute}="${name}"]`, theme(name)))
        .join(''),
    ),
  }
}

/**
 * Shows `name` on the root element, as a Command's effect: the initial theme
 * removes the attribute, so the root's own declarations apply.
 */
export const apply = <Name extends string>(themes: Themes<Name>, name: Name): Effect.Effect<void> =>
  Effect.sync(() => {
    const root = document.documentElement
    if (name === themes.initial) root.removeAttribute(themes.attribute)
    else root.setAttribute(themes.attribute, name)
  })

/** The storage key a chosen theme's name is kept under, unless one is given. */
export const THEME_KEY = 'foldkit:theme'

/**
 * The text of a `<script>` for the document's head: it shows the theme whose
 * name is kept under `key`, so a reader who chose one never sees the initial
 * theme for a frame. A kept name that is not one of `themes` (a theme a later
 * build removed), and storage that throws, leave the initial theme.
 */
export const script = <Name extends string>(
  themes: Themes<Name>,
  key: string = THEME_KEY,
): string =>
  `(function(){try{var n=localStorage.getItem(${scriptLiteral(key)});` +
  `if(${scriptLiteral(themes.names.filter(name => name !== themes.initial))}.indexOf(n)!==-1)` +
  `document.documentElement.setAttribute(${scriptLiteral(themes.attribute)},n)}catch(e){}})()`

/**
 * Shows `name`, as `apply` does, and keeps it under `key` for the next visit,
 * as a Command's effect: the initial theme keeps nothing. Storage that throws
 * still shows it on this page.
 */
export const choose = <Name extends string>(
  themes: Themes<Name>,
  name: Name,
  key: string = THEME_KEY,
): Effect.Effect<void> =>
  apply(themes, name).pipe(
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
 * `theme` on the elements `selector` matches, below the root: its knobs and
 * every derivation again. A token resolves where it is declared, so knobs
 * alone under a subtree would change nothing derived from them there.
 */
export const scope = (theme: KnobTheme<Standard>, selector: string): StyleValue => {
  const { knob: _knob, ...derived } = shipped
  return global(`${selector}{${declarations(derived)}}${knobRule(selector, theme)}`)
}
