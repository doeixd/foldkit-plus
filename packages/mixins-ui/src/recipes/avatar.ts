/**
 * An avatar and a row of them.
 *
 * An avatar is a muted disc with initials, the picture covering it. `size`
 * is its size; `shape` a disc, a rounded square or a square (a disc follows
 * the radius knob: rounded below 1, square at 0); `color: 'name'` tints the
 * initials by the name's hue, so a person keeps one colour; `ring` draws a
 * band of the page around it (to stand out of a stack or off a photo) or of
 * the accent (chosen, speaking). The status dot sits on the lower end
 * corner, in its status's color, ringed in the page so it reads on the
 * picture. The disc and picture clip themselves, not the root, which would
 * clip the dot.
 *
 * A group overlaps its avatars by `overlap`, each ringed in the page so the
 * one above reads apart from the one below.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { AvatarGroupSlots, AvatarSlots } from '../avatar.js'
import { component, imageEdge, ref, variant } from './design.js'

/** A band of `color` around the avatar, outside its box, so stacking and sizing do not move. */
const ring = (color: string) =>
  variant(Style.self({ boxShadow: `0 0 0 ${ref.border.thick} ${color}` }))

/** The initials in the name's hue: the accent's tint and ink, turned to it. */
const byName = (from: string) => `oklch(from ${from} l c var(--fk-avatar-hue))`

export const Avatar = Style.recipeFor(AvatarSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        flex: 'none',
        display: 'inline-block',
        borderRadius: '50%',
        fontWeight: ref.weight.semibold,
      }),
    ),
    fallback: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        inlineSize: '100%',
        blockSize: '100%',
        borderRadius: 'inherit',
        overflow: 'clip',
        background: ref.surface.muted,
        color: ref.text.muted,
        lineHeight: '1',
        // Initials are a mark, not words to break or select.
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }),
    ),
    image: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        inlineSize: '100%',
        blockSize: '100%',
        borderRadius: 'inherit',
        objectFit: 'cover',
        ...imageEdge,
      }),
    ),
    status: component(
      Style.self({
        position: 'absolute',
        insetBlockEnd: '0',
        insetInlineEnd: '0',
        inlineSize: 'max(0.5rem, 28%)',
        aspectRatio: '1',
        borderRadius: ref.radius.full,
        boxShadow: `0 0 0 ${ref.border.thick} ${ref.surface.base}`,
      }),
      Style.nest('&[data-status="online"]', { background: ref.success.default }),
      Style.nest('&[data-status="away"]', { background: ref.warning.default }),
      Style.nest('&[data-status="busy"]', { background: ref.error.default }),
      Style.nest('&[data-status="offline"]', { background: ref.outline.overt }),
    ),
  },
  variants: {
    size: {
      xs: {
        root: variant(
          Style.self({
            inlineSize: '1.25rem',
            blockSize: '1.25rem',
            fontSize: `calc(${ref.size.xs} * 0.75)`,
          }),
        ),
      },
      sm: {
        root: variant(
          Style.self({ inlineSize: '1.5rem', blockSize: '1.5rem', fontSize: ref.size.xs }),
        ),
      },
      md: {
        root: variant(
          Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem', fontSize: ref.size.sm }),
        ),
      },
      lg: {
        root: variant(
          Style.self({
            inlineSize: '3.5rem',
            blockSize: '3.5rem',
            ...role('subtitle'),
            lineHeight: '1',
          }),
        ),
      },
      xl: {
        root: variant(
          Style.self({ inlineSize: '5rem', blockSize: '5rem', ...role('title'), lineHeight: '1' }),
        ),
      },
    },
    shape: {
      // A disc at the default radius, a rounded square below it, square at 0.
      circle: {
        root: variant(
          Style.self({ borderRadius: `calc(50% * min(${ref.knob['radius-factor']}, 1))` }),
        ),
      },
      rounded: {
        root: variant(Style.self({ borderRadius: `calc(22% * ${ref.knob['radius-factor']})` })),
      },
      square: { root: variant(Style.self({ borderRadius: '0' })) },
    },
    color: {
      neutral: {},
      name: {
        // Not the `+N` of a group, which is nobody's.
        fallback: variant(
          Style.nest(':where(:not([data-rest])) > &', {
            background: byName(ref.accent.subtle),
            color: byName(ref.accent.ink),
          }),
        ),
      },
    },
    ring: {
      none: {},
      page: { root: ring(ref.surface.base) },
      accent: {
        // A gap of the page, then the accent, as a focus ring stands off its control.
        root: variant(
          Style.self({
            boxShadow: `0 0 0 ${ref.border.thick} ${ref.surface.base}, 0 0 0 calc(2 * ${ref.border.thick}) ${ref.accent.default}`,
          }),
        ),
      },
    },
  },
  defaults: { size: 'md', shape: 'circle', color: 'neutral', ring: 'none' },
})

export const AvatarGroup = Style.recipeFor(AvatarGroupSlots)({
  base: {
    root: component(
      Style.self({ display: 'flex', alignItems: 'center', isolation: 'isolate' }),
      // Each ringed in the page, so the one in front reads apart from the one behind.
      Style.nest('& > *', { boxShadow: `0 0 0 ${ref.border.thick} ${ref.surface.base}` }),
    ),
  },
  variants: {
    overlap: {
      tight: {
        root: variant(Style.nest('& > * + *', { marginInlineStart: `calc(-1 * ${ref.space.sm})` })),
      },
      loose: {
        root: variant(Style.nest('& > * + *', { marginInlineStart: `calc(-1 * ${ref.space.xs})` })),
      },
      none: { root: variant(Style.self({ gap: ref.space['2xs'] })) },
    },
  },
  defaults: { overlap: 'tight' },
})
