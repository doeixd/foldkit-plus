/**
 * `foldkit-mixins/app`: an application's style setup, fixed once. Every
 * application on the standard layers writes the same preamble: its theme's
 * tokens, their references, the `app` layer passed to each style, and a page
 * stylesheet of the layer order, the reset, the tokens and the body defaults.
 * `AppStyle.make` is that preamble as a value.
 */
import { body, reset } from './defaults.js'
import { standard } from './layers.js'
import {
  forSlots,
  slots,
  stylesheet,
  type Declared,
  type DeclaredPieces,
  type NamedStyle,
  type StyleOptions,
  type StylePieces,
} from './style.js'
import { compose, type StyleValue } from './styleValue.js'
import { compose as composeThemes, ref, type Refs, type ThemeTokens } from './theme/core.js'
import type { KnobTheme, Standard } from './theme/knobs.js'
import { root, type RootOptions } from './theme/root.js'
import { standardOf, type StandardTokens, type Themes } from './theme/themes.js'

interface Common<Own extends ThemeTokens> {
  /**
   * Tokens of the application's own, laid over the shipped ones:
   * `Theme.define({ game: { … } })`, read through `t` beside them.
   */
  readonly tokens?: Own
  /** The page's `color-scheme`; `'light'` keeps a light page light in a dark browser. Default `'light dark'`. */
  readonly colorScheme?: NonNullable<RootOptions['colorScheme']>
  /**
   * More page-wide pieces after `Defaults.body`, such as `Defaults.headings`,
   * keyframes or a font face, placed in the `defaults` layer.
   */
  readonly global?: ReadonlyArray<StyleValue>
}

export interface AppStyleOptions<Own extends ThemeTokens> extends Common<Own> {
  /** The application's one theme: `Theme.make({ … })`. */
  readonly theme: KnobTheme<Standard>
}

/**
 * The options with a set of named themes in place of one: the root declares
 * the initial theme, and each other is drawn where the Model names it
 * (`Themes.apply`).
 */
export interface AppStyleThemesOptions<
  Name extends string,
  Own extends ThemeTokens,
> extends Common<Own> {
  readonly themes: Themes<Name>
}

/** A style's options with its layer fixed to the application's. */
export type AppStyleOptionsFor = Omit<StyleOptions, 'layer'>

export interface AppStyle<Own extends ThemeTokens> {
  /** Every shipped token with the theme's knobs, and the application's own over them. */
  readonly theme: ReturnType<typeof composeThemes<StandardTokens, Own>>
  /** Every token of `theme` as a typed `var(--fk-…)` reference. */
  readonly t: Refs<ReturnType<typeof composeThemes<StandardTokens, Own>>>
  /** The layer order the stylesheet declares, for placing a layout or recipe (`L.in('layouts', …)`). */
  readonly L: typeof standard
  /** `Style.slots` in the `app` layer: the application's own Slots, declared by their style. */
  readonly slots: <S>(pieces: DeclaredPieces<S>, options?: AppStyleOptionsFor) => Declared<S>
  /** `Style.forSlots` in the `app` layer: a published contract (`ButtonSlots`) styled for this application. */
  readonly forSlots: <Slots>(
    contract: Slots,
  ) => (pieces: StylePieces<Slots>, options?: AppStyleOptionsFor) => NamedStyle<Slots>
  /** The page sheet: the layer order, reset, tokens, `Defaults.body` and `global`. */
  readonly stylesheet: string
}

const app = standard.layer('app')

/**
 * The application's tokens, layer and page stylesheet:
 * `const { t, slots, stylesheet } = AppStyle.make({ theme: Theme.make({ … }) })`.
 * Slot styles are no longer in the stylesheet: a Slot injects its classes' CSS
 * when it first draws them.
 */
export function make<Name extends string, Own extends ThemeTokens = Record<never, never>>(
  options: AppStyleThemesOptions<Name, Own>,
): AppStyle<Own>
export function make<Own extends ThemeTokens = Record<never, never>>(
  options: AppStyleOptions<Own>,
): AppStyle<Own>
export function make(
  options: AppStyleOptions<ThemeTokens> | AppStyleThemesOptions<string, ThemeTokens>,
): AppStyle<ThemeTokens> {
  const shipped = 'themes' in options ? options.themes.root : standardOf(options.theme)
  const theme = composeThemes(shipped, options.tokens ?? {})
  const scheme = options.colorScheme === undefined ? {} : { colorScheme: options.colorScheme }
  return Object.freeze({
    theme,
    t: ref(theme),
    L: standard,
    slots: <S>(pieces: DeclaredPieces<S>, styleOptions?: AppStyleOptionsFor) =>
      slots(pieces, { ...styleOptions, layer: app }),
    forSlots:
      <Slots>(contract: Slots) =>
      (pieces: StylePieces<Slots>, styleOptions?: AppStyleOptionsFor) =>
        forSlots(contract)(pieces, { ...styleOptions, layer: app }),
    stylesheet: stylesheet(
      standard.declare,
      standard.in('reset', reset),
      standard.in('theme', root(theme, scheme)),
      ...('themes' in options ? [standard.in('theme', options.themes.scoped)] : []),
      standard.in('defaults', compose(body, ...(options.global ?? []))),
    ),
  })
}

export const AppStyle = { make } as const
