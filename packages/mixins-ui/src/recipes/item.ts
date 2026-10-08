/**
 * A row: media pinned square at the start, content stacking title over
 * description, actions pushed to the end. Density is the one axis: compact
 * rows for menus and palettes, comfortable ones for files and contacts.
 */
import { Style } from 'foldkit-mixins'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ItemSlots } from '../item.js'
import { component, ref, variant } from './design.js'

export const Item = Style.recipeFor(ItemSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.sm,
        minWidth: '0',
      }),
    ),
    media: component(
      Style.self({
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'clip',
      }),
    ),
    content: component(
      Style.self({
        display: 'grid',
        gap: '0.1rem',
        minWidth: '0',
        flex: '1',
      }),
    ),
    title: component(
      U.truncate,
      Style.self({
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    description: component(
      U.truncate,
      Style.self({
        fontSize: ref.size.sm,
        color: ref.text.muted,
      }),
    ),
    actions: component(
      Style.self({
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        marginInlineStart: 'auto',
      }),
    ),
  },
  variants: {
    density: {
      comfortable: {
        root: variant(Style.self({ padding: ref.space.sm })),
        media: variant(Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem' })),
      },
      compact: {
        root: variant(Style.self({ padding: `${ref.space['2xs']} ${ref.space.xs}` })),
        media: variant(Style.self({ inlineSize: '1.75rem', blockSize: '1.75rem' })),
      },
    },
  },
  defaults: { density: 'comfortable' },
})
