/**
 * Themes installed by name. A theme of typed knobs (`Theme.make`) holds only
 * knob values, and every token derives from knob variables, so one set of
 * derivations serves every theme: the root declares them with the initial
 * theme's knobs, and each other theme writes its knobs under
 * `:root[data-theme="name"]`, the same element, where the derivations resolve
 * them. Which theme is active is the application's Model's fact; `apply` is
 * the Command's effect that shows it.
 */
import { Effect, Schema } from 'effect'
import { global, type StyleValue } from '../styleValue.js'
import { compose, VAR_PREFIX, type ThemeTokens } from './core.js'
import { tokensOf, variables, type KnobSet, type KnobTheme, type Standard } from './knobs.js'
import { oklch } from './oklch.js'
import { tokens } from './tokens.js'

/**
 * The palette's derivations every standard theme shares. Its own knob
 * values are a theme's to replace: a theme declares every knob variable.
 */
export const palette = oklch({ accent: { h: 264, c: 0.17, l: '52%' } })

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
  /** The palette with the initial theme's knobs: what the root declares, and what `t` reads. */
  readonly palette: ReturnType<
    typeof compose<typeof palette, ReturnType<typeof tokensOf<Standard>>>
  >
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
    palette: compose(palette, tokensOf(theme(options.initial))),
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

/**
 * `theme` on the elements `selector` matches, below the root: its knobs and
 * every derivation again. A token resolves where it is declared, so knobs
 * alone under a subtree would change nothing derived from them there.
 */
export const scope = (theme: KnobTheme<Standard>, selector: string): StyleValue => {
  const { knob: _knob, ...derived } = compose(tokens, palette)
  return global(`${selector}{${declarations(derived)}}${knobRule(selector, theme)}`)
}
