/**
 * A modal dialog: the backdrop dims the page and the panel is a raised
 * surface. `size` is the panel's maximum width.
 */
import { Style } from 'foldkit-mixins'
import { DialogSlots } from '../dialog.js'
import { component, focusRing, ref, variant, hover } from './design.js'

const width = (max: string) => variant(Style.self({ maxInlineSize: `min(${max}, 100% - 2rem)` }))

export const Dialog = Style.recipeFor(DialogSlots)({
  base: {
    dialog: component(
      Style.self({
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        maxInlineSize: '100%',
        maxBlockSize: '100%',
      }),
      Style.pseudo('::backdrop', { background: 'transparent' }),
    ),
    backdrop: component(
      Style.self({
        position: 'fixed',
        inset: '0',
        background: `color-mix(in oklch, ${ref.surface.bedrock} 45%, transparent)`,
      }),
    ),
    panel: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: '100%',
        marginInline: 'auto',
        padding: ref.space.lg,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.base,
        boxShadow: `0 1rem 3rem color-mix(in oklch, ${ref.surface.bedrock} 25%, transparent)`,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        color: ref.text.overt,
        fontFamily: ref.font.heading,
        fontSize: ref.size.xl,
        fontWeight: ref.weight.semibold,
        lineHeight: ref.leading.tight,
      }),
    ),
    description: component(Style.self({ margin: '0', color: ref.text.muted })),
    closeButton: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: ref.space.sm,
        insetInlineEnd: ref.space.sm,
        padding: ref.space['2xs'],
        border: '0',
        borderRadius: ref.radius.sm,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
      }),
      hover({
        background: ref.surface.muted,
        color: ref.text.overt,
      }),
      focusRing,
    ),
  },
  variants: {
    size: {
      sm: { panel: width('24rem') },
      md: { panel: width('32rem') },
      lg: { panel: width('48rem') },
    },
  },
  defaults: { size: 'md' },
})
