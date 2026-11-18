/**
 * A status pill. `appearance` says how it carries its tone, `size` its step;
 * the tone is not an axis: the view writes it as `data-tone`, and one style
 * serves badges of every tone at once. A value outside the vocabulary keeps
 * the neutral base. A tone sets a few private custom properties, which the
 * chosen appearance reads, as the Button's tones do.
 *
 * A badge toned by an attribute of its own (a state's `data-state`) maps
 * its values with `badgeTones` through `.extend`.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { BadgeSlots } from '../badge.js'
import { component, focusRing, hover, ref, variant, type Tone } from './design.js'

/**
 * How a badge carries its tone: `tinted` (the default) a pill in the tone's
 * tint, `dot` a coloured dot before plain words with no fill, `outline` a
 * line in the tone around words in its ink, `solid` the tone's fill.
 */
export type BadgeAppearance = 'tinted' | 'dot' | 'outline' | 'solid'

const tint = 'var(--_fk-badge-tint)'
const ink = 'var(--_fk-badge-ink)'
const fill = 'var(--_fk-badge-fill)'
const onFill = 'var(--_fk-badge-on-fill)'
const line = 'var(--_fk-badge-line)'

const properties = (family: 'accent' | 'info' | 'success' | 'warning' | 'error'): Declarations => ({
  // The tone's subtle tint, which keeps the tone's hue over a tinted base.
  '--_fk-badge-tint': ref[family].subtle,
  '--_fk-badge-ink': ref[family].ink,
  '--_fk-badge-fill': ref[family].default,
  '--_fk-badge-on-fill': ref[family]['on-fill'],
  '--_fk-badge-line': ref[family].outline,
})

/** The neutral base: as quiet as the page's muted text. */
const neutral: Declarations = {
  '--_fk-badge-tint': ref.surface.muted,
  '--_fk-badge-ink': ref.text.muted,
  '--_fk-badge-fill': ref.text.muted,
  '--_fk-badge-on-fill': ref.surface.base,
  '--_fk-badge-line': ref.outline.default,
}

/**
 * Each tone of the vocabulary, read from `data-tone`. `danger` is the
 * palette's `error` family, which stays named so where it is a state.
 */
const toneStates: Readonly<Record<Tone, Declarations>> = {
  accent: properties('accent'),
  neutral,
  info: properties('info'),
  success: properties('success'),
  warning: properties('warning'),
  danger: properties('error'),
}

/**
 * The tone each value of `attribute` takes, for a badge whose tone is an
 * attribute the application already writes (`data-state`): a piece for
 * `Recipes.Badge.extend({ base: { badge: badgeTones(...) } })`. A value the
 * map leaves out keeps the base.
 */
export const badgeTones = (attribute: string, tones: Readonly<Record<string, Tone>>): StyleValue =>
  variant(
    ...Object.entries(tones).map(([value, tone]) =>
      Style.nest(`&[${attribute}="${value}"]`, toneStates[tone]),
    ),
  )

const dot = Style.nest('&::before', {
  background: fill,
  borderRadius: '50%',
  content: '""',
  flexShrink: '0',
  height: '0.4rem',
  width: '0.4rem',
})

export const Badge = Style.recipeFor(BadgeSlots)({
  base: {
    badge: component(
      Style.self({
        ...neutral,
        alignItems: 'center',
        // A pill, squarer as the radius knob falls below 1.
        borderRadius: ref.radius.full,
        display: 'inline-flex',
        // Its words never wrap, so it never shrinks below them: squeezed in a
        // row, a badge's text ran into the next one.
        flexShrink: '0',
        ...role('caption'),
        fontWeight: ref.weight.semibold,
        gap: '0.35rem',
        // No rung of the space scale is 0.15rem or 0.6rem, so each is a share of the nearest.
        paddingBlock: `calc(${ref.space['2xs']} * 0.6)`,
        paddingInline: `calc(${ref.space.xs} * 1.2)`,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }),
      Style.states(toneStates, 'data-tone'),
      // Only a badge drawn as a link answers the pointer; a plain one is not a control.
      Style.nest('a&', { cursor: 'pointer' }),
      Style.nest('a&:hover', { filter: 'brightness(0.94)' }),
      focusRing,
    ),
    icon: component(
      Style.self({
        alignItems: 'center',
        display: 'inline-flex',
        flexShrink: '0',
        fontSize: '1em',
        lineHeight: '1',
      }),
    ),
    dismiss: component(
      Style.self({
        alignItems: 'center',
        background: 'transparent',
        border: '0',
        // A rounded square inside the pill, not a disc: its corner follows the radius knob.
        borderRadius: ref.radius.sm,
        blockSize: '1.4em',
        color: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        flexShrink: '0',
        font: 'inherit',
        fontSize: '1.15em',
        inlineSize: '1.4em',
        justifyContent: 'center',
        lineHeight: '1',
        // Tucked into the pill's end padding, so the pill keeps its height.
        marginBlock: '-0.2em',
        marginInlineEnd: `calc(${ref.space['2xs']} * -0.8)`,
        padding: '0',
        transitionDuration: ref.motion.fast,
        transitionProperty: 'background-color',
      }),
      hover({ background: 'color-mix(in oklab, currentColor 18%, transparent)' }),
      focusRing,
    ),
  },
  variants: {
    appearance: {
      tinted: { badge: variant(Style.self({ background: tint, color: ink })) },
      dot: {
        badge: variant(
          Style.self({ background: 'transparent', color: ref.text.default, paddingInline: '0' }),
          dot,
        ),
      },
      // A ring inside the edge rather than a border, so an outlined badge is the
      // size of a tinted one beside it.
      outline: {
        badge: variant(
          Style.self({
            background: 'transparent',
            boxShadow: `inset 0 0 0 ${ref.border.thin} ${line}`,
            color: ink,
          }),
        ),
      },
      solid: { badge: variant(Style.self({ background: fill, color: onFill })) },
    },
    size: {
      sm: {
        badge: variant(
          Style.self({
            ...role('micro'),
            paddingInline: `calc(${ref.space.xs} * 0.9)`,
          }),
        ),
      },
      md: { badge: variant(Style.self(role('caption'))) },
      lg: {
        badge: variant(
          Style.self({
            ...role('body'),
            paddingBlock: ref.space['2xs'],
            paddingInline: ref.space.sm,
          }),
        ),
      },
    },
  },
  defaults: { appearance: 'tinted' },
})
