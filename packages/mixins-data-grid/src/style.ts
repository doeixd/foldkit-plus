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
        // A drag that began on a header's text would otherwise select it.
        userSelect: 'none',
      }),
      Style.nest('&[data-pinned]', { zIndex: '1' }),
      Style.nest('&[data-dragging]', {
        zIndex: '3',
        background: ref.surface.default,
        opacity: '0.9',
        cursor: 'grabbing',
      }),
      Style.nest('&[data-drop="before"]', {
        borderInlineStart: `${ref.border.thick} solid ${ref.outline.focus}`,
      }),
      Style.nest('&[data-drop="after"]', {
        borderInlineEnd: `${ref.border.thick} solid ${ref.outline.focus}`,
      }),
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
    menuButton: Style.compose(
      Style.self({
        background: 'none',
        border: 'none',
        color: ref.text.muted,
        cursor: 'pointer',
        marginInlineStart: 'auto',
        paddingInline: ref.space.xs,
      }),
      Style.nest('&[aria-expanded="true"]', { color: ref.text.default }),
    ),
    menu: Style.compose(
      Style.self({
        background: ref.surface.base,
        border: line,
        borderRadius: ref.radius.md,
        fontWeight: ref.weight.normal,
        minWidth: '10rem',
        paddingBlock: ref.space.xs,
        zIndex: '4',
      }),
      Style.pseudo(':focus-visible', { outline: `${ref.border.thick} solid ${ref.outline.focus}` }),
    ),
    menuItem: Style.compose(
      Style.self({ cursor: 'pointer', paddingBlock: ref.space.xs, paddingInline: ref.space.sm }),
      Style.nest('&[data-active="true"]', { background: ref.surface.muted }),
    ),
    // The header's label, as text: the direction is drawn after it.
    sort: Style.compose(
      Style.self({
        background: 'none',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        padding: '0',
      }),
      Style.nest('&[data-sort="asc"]::after', { content: '" ▲"', fontSize: ref.size.xs }),
      Style.nest('&[data-sort="desc"]::after', { content: '" ▼"', fontSize: ref.size.xs }),
    ),
    placeholder: Style.self({ background: ref.surface.subtle }),
    status: Style.self({ color: ref.text.muted, padding: ref.space.md }),
  },
  { layer: Layers.standard.layer('components') },
)
