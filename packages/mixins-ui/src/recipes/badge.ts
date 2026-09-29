/**
 * A status pill: the base pill with a dot, toned by an attribute's value.
 *
 * Unlike the variant recipes, every tone is present at once: one style serves
 * badges in every state, so there is no variant axis to select. `Badge` takes
 * the attribute carrying the value and the value-to-tone map instead; values
 * the map leaves out keep the base.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { component, ref, variant } from './design.js'

/** The palette families a badge value can take; unmapped values keep the base. */
export type BadgeTone = 'success' | 'warning' | 'info' | 'error'

export interface BadgeOptions {
  /** The attribute carrying the value, such as 'data-state'. */
  readonly attribute: string
  /** Which tone each attribute value takes. */
  readonly tones: Readonly<Record<string, BadgeTone>>
}

const toned = (attribute: string, value: string, tone: BadgeTone): StyleValue =>
  variant(
    Style.nest(`&[${attribute}="${value}"]`, {
      background: `color-mix(in oklch, ${ref[tone].default} 14%, ${ref.surface.base})`,
      color: ref[tone].ink,
    }),
  )

/** The badge's piece for the application's own badge slot. */
export const Badge = (options: BadgeOptions): { readonly badge: StyleValue } => ({
  badge: component(
    Style.self({
      alignItems: 'center',
      background: ref.surface.muted,
      borderRadius: ref.radius.full,
      color: ref.text.muted,
      display: 'inline-flex',
      fontSize: ref.size.xs,
      fontWeight: ref.weight.semibold,
      gap: '0.35rem',
      padding: '0.15rem 0.6rem',
      whiteSpace: 'nowrap',
    }),
    // A dot before the words, in the pill's own color.
    Style.nest('&::before', {
      background: 'currentColor',
      borderRadius: '50%',
      content: '""',
      height: '0.4rem',
      width: '0.4rem',
    }),
    ...Object.entries(options.tones).map(([value, tone]) => toned(options.attribute, value, tone)),
  ),
})
