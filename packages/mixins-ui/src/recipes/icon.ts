/**
 * An icon. With no size it stands on the size ladder (16px, 14px compact),
 * so it steps with the control it sits in; a size fixes it to the type
 * scale. The drawing fills the box. A `surface` makes the box a tile twice the
 * icon's size around it (outlined, tinted, solid or raised), `tone` inks the
 * icon and colours the surface, and `shape: 'circle'` rounds it.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { IconSlots } from '../icon.js'
import { component, ref, variant } from './design.js'

/** The icon's own size, which a tile is a multiple of. */
const size = 'var(--_fk-icon-size)'
const ink = 'var(--_fk-icon-ink)'
const tint = 'var(--_fk-icon-tint)'
const fill = 'var(--_fk-icon-fill)'
const onFill = 'var(--_fk-icon-on-fill)'
const line = 'var(--_fk-icon-line)'

const fixed = (value: string) => variant(Style.self({ '--_fk-icon-size': value }))

const toned = (family: 'accent' | 'info' | 'success' | 'warning' | 'error') =>
  variant(
    Style.self({
      '--_fk-icon-ink': ref[family].ink,
      '--_fk-icon-tint': ref[family].subtle,
      '--_fk-icon-fill': ref[family].default,
      '--_fk-icon-on-fill': ref[family]['on-fill'],
      '--_fk-icon-line': ref[family].outline,
    }),
  )

/** A tile: the box twice the icon, which keeps the icon its own size in the middle. */
const tile = {
  blockSize: `calc(${size} * 2)`,
  borderRadius: ref.radius.md,
  inlineSize: `calc(${size} * 2)`,
  padding: `calc(${size} / 2)`,
} as const

export const Icon = Style.recipeFor(IconSlots)({
  base: {
    glyph: component(
      Style.self({
        '--_fk-icon-size': ladder('icon'),
        '--_fk-icon-ink': 'currentColor',
        '--_fk-icon-tint': ref.surface.muted,
        '--_fk-icon-fill': ref.text.default,
        '--_fk-icon-on-fill': ref.surface.base,
        '--_fk-icon-line': ref.outline.default,
        display: 'inline-flex',
        flex: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        color: 'currentColor',
        // A drawing of your own that is text (initials, a count) is as large as the icon would be.
        fontSize: size,
        fontWeight: ref.weight.semibold,
        lineHeight: '1',
        inlineSize: size,
        blockSize: size,
        // The corner `mark` is placed against the box.
        position: 'relative',
      }),
      // `Icon.draw` writes `1em` for a drawing that stands alone; in a glyph it fills the box.
      Style.nest('& > svg', { inlineSize: '100%', blockSize: '100%' }),
    ),
    // A badge or a dot partly out of the box's corner; logical, so a mirrored page flips it.
    mark: component(
      Style.self({
        display: 'inline-flex',
        insetBlockStart: '0',
        insetInlineEnd: '0',
        pointerEvents: 'none',
        position: 'absolute',
      }),
    ),
  },
  variants: {
    size: {
      xs: { glyph: fixed(ref.size.xs) },
      sm: { glyph: fixed(ref.size.sm) },
      md: { glyph: fixed(ref.size.md) },
      lg: { glyph: fixed(ref.size.lg) },
      xl: { glyph: fixed(ref.size.xl) },
    },
    tone: {
      accent: { glyph: toned('accent') },
      neutral: {
        glyph: variant(
          Style.self({
            '--_fk-icon-ink': ref.text.muted,
            '--_fk-icon-tint': ref.surface.muted,
            '--_fk-icon-fill': ref.text.muted,
            '--_fk-icon-on-fill': ref.surface.base,
            '--_fk-icon-line': ref.outline.default,
          }),
        ),
      },
      info: { glyph: toned('info') },
      success: { glyph: toned('success') },
      warning: { glyph: toned('warning') },
      danger: { glyph: toned('error') },
    },
    surface: {
      outline: {
        glyph: variant(
          Style.self({ ...tile, border: `${ref.border.thin} solid ${line}`, color: ink }),
        ),
      },
      soft: { glyph: variant(Style.self({ ...tile, background: tint, color: ink })) },
      solid: { glyph: variant(Style.self({ ...tile, background: fill, color: onFill })) },
      raised: {
        glyph: variant(
          Style.self({
            ...tile,
            background: ref.surface.base,
            border: `${ref.border.thin} solid ${ref.outline.subtle}`,
            boxShadow: ref.shadow.sm,
            color: ink,
          }),
        ),
      },
    },
    shape: {
      circle: { glyph: variant(Style.self({ borderRadius: ref.radius.full })) },
      square: { glyph: variant(Style.self({ borderRadius: ref.radius.sm })) },
    },
  },
})
