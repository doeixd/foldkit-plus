/**
 * `foldkit-mixins/app`: an application's style setup, fixed once. Every
 * application on the standard layers writes the same preamble: a theme over
 * `Theme.tokens`, its references, the `app` layer passed to each style, and a
 * page stylesheet of the layer order, the reset, the tokens, the palette and
 * the body defaults. `AppStyle.make` is that preamble as a value.
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
import { root, type RootOptions } from './theme/root.js'
import { tokens, type Tokens } from './theme/tokens.js'

export interface AppStyleOptions<Palette extends ThemeTokens> {
  /** The application's own tokens, usually `Theme.oklch(…)`, laid over `Theme.tokens`. */
  readonly palette: Palette
  /** The page's `color-scheme`; `'light'` keeps a light page light in a dark browser. Default `'light dark'`. */
  readonly colorScheme?: NonNullable<RootOptions['colorScheme']>
  /**
   * More page-wide pieces after `Defaults.body`, such as `Defaults.headings`,
   * keyframes or a font face, placed in the `defaults` layer.
   */
  readonly global?: ReadonlyArray<StyleValue>
}

/** A style's options with its layer fixed to the application's. */
export type AppStyleOptionsFor = Omit<StyleOptions, 'layer'>

export interface AppStyle<Palette extends ThemeTokens> {
  /** `Theme.tokens` with the palette over it. */
  readonly theme: ReturnType<typeof composeThemes<Tokens, Palette>>
  /** Every token of `theme` as a typed `var(--fk-…)` reference. */
  readonly t: Refs<ReturnType<typeof composeThemes<Tokens, Palette>>>
  /** The layer order the stylesheet declares, for placing a layout or recipe (`L.in('layouts', …)`). */
  readonly L: typeof standard
  /** `Style.slots` in the `app` layer: the application's own Slots, declared by their style. */
  readonly slots: <S>(pieces: DeclaredPieces<S>, options?: AppStyleOptionsFor) => Declared<S>
  /** `Style.forSlots` in the `app` layer: a published contract (`ButtonSlots`) styled for this application. */
  readonly forSlots: <Slots>(
    contract: Slots,
  ) => (pieces: StylePieces<Slots>, options?: AppStyleOptionsFor) => NamedStyle<Slots>
  /** The page sheet: the layer order, reset, tokens, palette, `Defaults.body` and `global`. */
  readonly stylesheet: string
}

const app = standard.layer('app')

/**
 * The application's theme, layer and page stylesheet:
 * `const { t, slots, stylesheet } = AppStyle.make({ palette: Theme.oklch({ … }) })`.
 * Slot styles are no longer in the stylesheet: a Slot injects its classes' CSS
 * when it first draws them.
 */
export const make = <Palette extends ThemeTokens>(
  options: AppStyleOptions<Palette>,
): AppStyle<Palette> => {
  const theme = composeThemes(tokens, options.palette)
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
      standard.in('tokens', root(tokens, scheme)),
      standard.in('theme', root(options.palette, scheme)),
      standard.in('defaults', compose(body, ...(options.global ?? []))),
    ),
  })
}

export const AppStyle = { make } as const
