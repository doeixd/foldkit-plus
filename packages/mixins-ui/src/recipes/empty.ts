/**
 * An empty state: centred and quiet, so it reads as an absence rather than
 * content. The icon sits muted in a disc, or an `illustration` larger and
 * bare; the title reads as the heading and the actions are kept. `frame`
 * draws it on nothing, inside a dashed outline (the drop-zone look of a list
 * waiting for its first item) or on a muted fill; `tone: 'danger'` inks the
 * icon for a load that failed; `size` sets the room around it.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { EmptySlots } from '../empty.js'
import { component, ref, variant } from './design.js'

export const Empty = Style.recipeFor(EmptySlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        justifyItems: 'center',
        gap: ref.space.sm,
        textAlign: 'center',
        borderRadius: ref.radius.lg,
      }),
    ),
    icon: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBlockEnd: ref.space['2xs'],
        color: ref.text.muted,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        ...role('subtitle'),
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    description: component(
      Style.self({
        margin: '0',
        maxWidth: '24rem',
        ...role('body'),
        color: ref.text.muted,
        textWrap: 'pretty',
      }),
    ),
    action: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: ref.space.xs,
        marginBlockStart: ref.space.xs,
      }),
    ),
  },
  variants: {
    media: {
      icon: {
        icon: variant(
          Style.self({
            inlineSize: '3rem',
            blockSize: '3rem',
            borderRadius: ref.radius.full,
            background: `var(--_fk-empty-ground, ${ref.surface.muted})`,
          }),
          Style.nest('& > :is(svg, img)', { inlineSize: '1.5rem', blockSize: '1.5rem' }),
        ),
      },
      illustration: {
        icon: variant(Style.nest('& > :is(svg, img)', { inlineSize: '8rem', blockSize: 'auto' })),
      },
    },
    frame: {
      none: {},
      dashed: {
        root: variant(Style.self({ border: `${ref.border.thin} dashed ${ref.outline.default}` })),
      },
      filled: { root: variant(Style.self({ background: ref.surface.subtle })) },
    },
    tone: {
      neutral: {},
      danger: {
        icon: variant(Style.self({ color: ref.error.ink, '--_fk-empty-ground': ref.error.subtle })),
      },
    },
    size: {
      compact: { root: variant(Style.self({ padding: ref.space.lg })) },
      comfortable: { root: variant(Style.self({ padding: ref.space.xl })) },
    },
  },
  defaults: { media: 'icon', frame: 'none', tone: 'neutral', size: 'comfortable' },
})
