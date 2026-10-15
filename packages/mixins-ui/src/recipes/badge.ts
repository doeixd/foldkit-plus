/**
 * A status pill, toned by an attribute's value, in one of four appearances.
 *
 * Unlike the variant recipes, every tone is present at once: one style serves
 * badges in every state, so there is no tone axis to select. `Badge` takes
 * the attribute carrying the value and the value-to-tone map instead; values
 * the map leaves out keep the base. A tone sets a few private custom
 * properties, which the chosen appearance reads, as the Button's tones do.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { component, ref, variant } from './design.js'

/** The palette families a badge value can take; unmapped values keep the base. */
export type BadgeTone = 'success' | 'warning' | 'info' | 'error'

/**
 * How a badge carries its tone: `tinted` (the default) a pill in the tone's
 * tint, `dot` a coloured dot before plain words with no fill, `outline` a
 * line in the tone around words in its ink, `solid` the tone's fill.
 */
export type BadgeAppearance = 'tinted' | 'dot' | 'outline' | 'solid'

export interface BadgeOptions {
  /** The attribute carrying the value, such as 'data-state'. */
  readonly attribute: string
  /** Which tone each attribute value takes. */
  readonly tones: Readonly<Record<string, BadgeTone>>
  readonly appearance?: BadgeAppearance | undefined
}

const tint = 'var(--_fk-badge-tint)'
const ink = 'var(--_fk-badge-ink)'
const fill = 'var(--_fk-badge-fill)'
const onFill = 'var(--_fk-badge-on-fill)'
const line = 'var(--_fk-badge-line)'

const toned = (attribute: string, value: string, tone: BadgeTone): StyleValue =>
  variant(
    Style.nest(`&[${attribute}="${value}"]`, {
      // The tone's subtle tint, which keeps the tone's hue over a tinted base.
      '--_fk-badge-tint': ref[tone].subtle,
      '--_fk-badge-ink': ref[tone].ink,
      '--_fk-badge-fill': ref[tone].default,
      '--_fk-badge-on-fill': ref[tone]['on-fill'],
      '--_fk-badge-line': ref[tone].outline,
    }),
  )

const dot = Style.nest('&::before', {
  background: fill,
  borderRadius: '50%',
  content: '""',
  flexShrink: '0',
  height: '0.4rem',
  width: '0.4rem',
})

const appearances: Readonly<Record<BadgeAppearance, StyleValue>> = {
  tinted: Style.self({ background: tint, color: ink }),
  dot: Style.compose(
    Style.self({ background: 'transparent', color: ref.text.default, paddingInline: '0' }),
    dot,
  ),
  // A ring inside the edge rather than a border, so an outlined badge is the
  // size of a tinted one beside it.
  outline: Style.self({
    background: 'transparent',
    boxShadow: `inset 0 0 0 ${ref.border.thin} ${line}`,
    color: ink,
  }),
  solid: Style.self({ background: fill, color: onFill }),
}

/** The badge's piece for the application's own badge slot. */
export const Badge = (options: BadgeOptions): { readonly badge: StyleValue } => ({
  badge: component(
    Style.self({
      // The base, a value the map leaves out: neutral, as quiet as the page's muted text.
      '--_fk-badge-tint': ref.surface.muted,
      '--_fk-badge-ink': ref.text.muted,
      '--_fk-badge-fill': ref.text.muted,
      '--_fk-badge-on-fill': ref.surface.base,
      '--_fk-badge-line': ref.outline.default,
      alignItems: 'center',
      // A pill at the default radius, rounder or squarer with the radius knob.
      borderRadius: ref.radius.xl,
      display: 'inline-flex',
      // Its words never wrap, so it never shrinks below them: squeezed in a
      // row, a badge's text ran into the next one.
      flexShrink: '0',
      ...role('caption'),
      fontWeight: ref.weight.semibold,
      gap: '0.35rem',
      padding: '0.15rem 0.6rem',
      whiteSpace: 'nowrap',
    }),
    appearances[options.appearance ?? 'tinted'],
    ...Object.entries(options.tones).map(([value, tone]) => toned(options.attribute, value, tone)),
  ),
})
