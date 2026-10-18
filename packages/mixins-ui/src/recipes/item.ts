/**
 * A row and a list of rows.
 *
 * A row lays media at the start, the title over the description, and the
 * actions pushed to the end. `variant` is how it stands off the page (on
 * nothing, in an outline, or on a muted fill); `density` sizes the row and
 * its media, compact for menus and palettes; `media` frames what is at the
 * start: as it is, in a tinted tile for an icon, or clipped square for a
 * picture. A pressable row tints under the pointer; a chosen one keeps a
 * film of its text, which a dark page shows lighter rather than sunken.
 *
 * A list divides its rows by hairlines or sets them apart.
 */
import { Style } from 'foldkit-mixins'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { role } from 'foldkit-mixins/theme'
import { ItemGroupSlots, ItemSlots } from '../item.js'
import { component, focusRing, ref, transition, variant } from './design.js'

/** A film of the row's text, `share` of the `state-tint` knob. */
const film = (share: string) =>
  `color-mix(in oklab, currentColor calc(${ref.knob['state-tint']} * ${share}), transparent)`

export const Item = Style.recipeFor(ItemSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.sm,
        minWidth: '0',
        borderRadius: ref.radius.md,
        color: ref.text.default,
        ...transition('background-color, opacity'),
      }),
      Style.nest('&[data-pressable="true"]:not([data-disabled="true"]):is(:hover, :active)', {
        backgroundImage: `linear-gradient(${film('0.5')}, ${film('0.5')})`,
      }),
      // An image layer, so it lays over whatever fill the variant gives the row.
      Style.nest('&[data-selected="true"]', {
        backgroundImage: `linear-gradient(${film('1')}, ${film('1')})`,
      }),
      Style.nest('&[data-disabled="true"]', { opacity: '0.5' }),
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
        ...role('body'),
        color: ref.text.muted,
      }),
    ),
    // Above the overlay, so they stay pressable on a pressable row.
    actions: component(
      Style.self({
        position: 'relative',
        zIndex: '1',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        marginInlineStart: 'auto',
      }),
    ),
    overlay: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        margin: '0',
        padding: '0',
        border: '0',
        borderRadius: 'inherit',
        background: 'transparent',
        cursor: 'pointer',
      }),
      Style.pseudo(':is(:disabled, [aria-disabled="true"])', { cursor: 'not-allowed' }),
      focusRing,
      Style.pseudo(':focus-visible', { outlineOffset: '-2px' }),
    ),
  },
  variants: {
    variant: {
      plain: {},
      outline: {
        root: variant(Style.self({ border: `${ref.border.thin} solid ${ref.outline.subtle}` })),
      },
      muted: { root: variant(Style.self({ backgroundColor: ref.surface.subtle })) },
    },
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
    media: {
      plain: {},
      icon: {
        media: variant(
          Style.self({
            borderRadius: ref.radius.md,
            background: ref.accent.subtle,
            color: ref.accent.ink,
          }),
          Style.nest('& > :is(svg, img)', { inlineSize: '50%', blockSize: '50%' }),
        ),
      },
      image: {
        media: variant(
          Style.self({ borderRadius: ref.radius.md }),
          Style.nest('& > :is(img, video, picture)', {
            inlineSize: '100%',
            blockSize: '100%',
            objectFit: 'cover',
          }),
        ),
      },
    },
  },
  defaults: { variant: 'plain', density: 'comfortable', media: 'plain' },
})

const line = `${ref.border.thin} solid ${ref.outline.subtle}`

export const ItemGroup = Style.recipeFor(ItemGroupSlots)({
  base: {
    root: component(Style.self({ display: 'grid', margin: '0', padding: '0', listStyle: 'none' })),
    row: component(Style.self({ display: 'grid' })),
  },
  variants: {
    layout: {
      divided: { row: variant(Style.nest('& + &', { borderBlockStart: line })) },
      separated: { root: variant(Style.self({ gap: ref.space.xs })) },
    },
  },
  defaults: { layout: 'divided' },
})
