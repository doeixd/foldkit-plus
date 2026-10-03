/**
 * The grid's default look, for a page that ships `foldkit-mixins/theme`'s
 * tokens and palette. It only paints: the geometry the virtual window
 * depends on is the view's, and the slots refuse a Style that sets it.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { GridSlots } from './slots.js'

const ref = Theme.ref(
  Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } })),
)

const line = `${ref.border.thin} solid ${ref.outline.subtle}`

/** Every piece is in the `components` layer, so an application's own layer wins. */
export const GridStyle = Style.forSlots(GridSlots)(
  {
    root: Style.compose(
      Style.self({
        background: ref.surface.base,
        color: ref.text.default,
        fontVariantNumeric: 'tabular-nums',
      }),
      Style.pseudo(':focus-visible', { outline: `${ref.border.thick} solid ${ref.outline.focus}` }),
    ),
    // Above the body's cells, pinned ones included, as it sticks to the top.
    header: Style.self({ zIndex: '2', background: ref.surface.muted }),
    headerCell: Style.compose(
      Style.self({
        alignItems: 'center',
        background: ref.surface.muted,
        borderBlockEnd: line,
        display: 'flex',
        fontSize: ref.size.sm,
        fontWeight: ref.weight.semibold,
        paddingInline: ref.space.sm,
      }),
      Style.nest('&[data-pinned]', { zIndex: '1' }),
    ),
    cell: Style.compose(
      Style.self({
        alignItems: 'center',
        borderBlockEnd: line,
        display: 'flex',
        overflow: 'hidden',
        paddingInline: ref.space.sm,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      // A pinned cell is drawn over the cells scrolling under it, so it needs a ground.
      Style.nest('&[data-pinned]', { background: ref.surface.base, zIndex: '1' }),
      Style.nest('&[data-focused="true"]', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
    ),
    placeholder: Style.self({ background: ref.surface.subtle }),
    status: Style.self({ color: ref.text.muted, padding: ref.space.md }),
  },
  { layer: Layers.standard.layer('components') },
)
