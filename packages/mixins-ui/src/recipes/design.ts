/**
 * What every recipe shares: typed token references, the layer each piece is
 * emitted in, and the focus and disabled treatments. The recipes assume a page
 * that ships `Theme.root` of `Theme.tokens` and a `Theme.oklch` palette from
 * `foldkit-mixins/theme`; a token name either lacks is a type error here.
 */
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import type { OklchTheme, Tokens } from 'foldkit-mixins/theme'

type Design = Tokens & OklchTheme

/** `var(--fk-group-name)` for a token the shipped scales or palette define. */
export const token = <Group extends keyof Design & string>(
  group: Group,
  name: keyof Design[Group] & string,
): string => `var(--fk-${group}-${name})`

type Declarations = Readonly<Record<string, string>>

/**
 * Declarations on the slot's own element, as a rule rather than inline, so
 * a layer can hold them and an application's stylesheet can override them.
 */
export const self = (declarations: Declarations): StyleValue => Style.pseudo('', declarations)

/** The base of a recipe, in the `components` layer. */
export const component = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('components', Style.compose(...pieces))

/** A variant or compound, in the `variants` layer, so it beats the base. */
export const variant = (...pieces: ReadonlyArray<StyleValue>): StyleValue =>
  Layers.standard.in('variants', Style.compose(...pieces))

const disabledSelector = ':is([aria-disabled="true"], :disabled)'

/** Hover and active rules that skip a disabled element. */
export const whenEnabled = (state: ':hover' | ':active', declarations: Declarations) =>
  Style.pseudo(`${state}:not([aria-disabled="true"], :disabled)`, declarations)

export const focusRing: StyleValue = Style.pseudo(':focus-visible', {
  outline: `${token('border', 'thick')} solid ${token('outline', 'focus')}`,
  outlineOffset: '2px',
})

export const disabled: StyleValue = Style.pseudo(disabledSelector, {
  opacity: '0.5',
  cursor: 'not-allowed',
})

export const transition = (properties: string): Declarations => ({
  transitionProperty: properties,
  transitionDuration: token('motion', 'fast'),
  transitionTimingFunction: token('motion', 'ease'),
})

/**
 * A tone is four private custom properties that the variants read: the fill,
 * its hover, the text on it, and the ink used where nothing is filled. Tone
 * and fill style are then independent axes with no compound per pair.
 */
export interface Tone {
  readonly fill: string
  readonly fillHover: string
  readonly onFill: string
  readonly ink: string
  readonly wash: string
}

export const tone = (value: Tone): StyleValue =>
  variant(
    self({
      '--_fk-tone-fill': value.fill,
      '--_fk-tone-fill-hover': value.fillHover,
      '--_fk-tone-on-fill': value.onFill,
      '--_fk-tone-ink': value.ink,
      '--_fk-tone-wash': value.wash,
    }),
  )

export const toneVar = (name: 'fill' | 'fill-hover' | 'on-fill' | 'ink' | 'wash'): string =>
  `var(--_fk-tone-${name})`

export const tones = {
  accent: tone({
    fill: token('accent', 'default'),
    fillHover: token('accent', 'hover'),
    onFill: token('accent', 'text'),
    ink: token('text', 'link'),
    wash: token('accent', 'subtle'),
  }),
  neutral: tone({
    fill: token('surface', 'default'),
    fillHover: token('surface', 'overt'),
    onFill: token('text', 'overt'),
    ink: token('text', 'default'),
    wash: token('surface', 'muted'),
  }),
  danger: tone({
    fill: token('error', 'default'),
    fillHover: token('error', 'outline'),
    onFill: token('error', 'text'),
    ink: token('error', 'outline'),
    wash: token('error', 'subtle'),
  }),
} as const
