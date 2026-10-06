/**
 * The grid's default look, for a page that ships `foldkit-mixins/theme`'s
 * tokens and palette. It only paints: the geometry the virtual window
 * depends on is the view's, and the slots refuse a Style that sets it.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { GridSlots } from './slots.js'

/** The tokens the grid's styles draw with; the marks' too (`marks.ts`). */
export const ref = Theme.ref(
  Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } })),
)

const line = `${ref.border.thin} solid ${ref.outline.subtle}`
// Between columns: barely there, so rows read across and columns still part.
const faint = `${ref.border.thin} solid color-mix(in oklch, ${ref.outline.subtle} 55%, transparent)`
// Where the pinned columns end and the scrolling ones pass under them.
const pinnedEdge = [
  Style.nest('&[data-pinned-edge="start"]', {
    borderInlineEnd: `${ref.border.thick} solid ${ref.outline.default}`,
  }),
  Style.nest('&[data-pinned-edge="end"]', {
    borderInlineStart: `${ref.border.thick} solid ${ref.outline.default}`,
  }),
] as const
// A small padlock, for a column that does not edit: a mask, so it takes the
// colour it is painted with.
const padlock = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z'/%3E%3C/svg%3E")`

// The field an edit is typed in fills its cell, the cell lifted off the grid
// (below), so an edit does not look like a cell that only has focus.
const field = Style.self({
  background: ref.surface.base,
  border: 'none',
  caretColor: ref.outline.focus,
  color: 'inherit',
  font: 'inherit',
  outline: `${ref.border.thick} solid ${ref.outline.focus}`,
  outlineOffset: `calc(-1 * ${ref.border.thick})`,
  paddingInline: ref.space.sm,
})
// A draft the column refuses: the field in the error colour.
const refused = Style.nest('&[aria-invalid="true"]', {
  outlineColor: ref.error.default,
  caretColor: ref.error.default,
})

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
        // A label stays on one line, however narrow the column: it is cut, not wrapped.
        whiteSpace: 'nowrap',
        // A drag that began on a header's text would otherwise select it.
        userSelect: 'none',
      }),
      Style.nest('&[data-pinned]', { zIndex: '1' }),
      ...pinnedEdge,
      // A column that does not edit, in a grid where others do: a padlock before its label.
      Style.nest('&[aria-readonly="true"]::before', {
        background: ref.text.muted,
        content: '""',
        flex: 'none',
        height: '0.75em',
        marginInlineEnd: ref.space['2xs'],
        mask: `${padlock} center / contain no-repeat`,
        width: '0.75em',
      }),
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
        borderInlineEnd: faint,
        display: 'flex',
        overflow: 'hidden',
        paddingInline: ref.space.sm,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      // A pinned cell is drawn over the cells scrolling under it, so it needs a ground.
      Style.nest('&[data-pinned]', { background: ref.surface.base, zIndex: '1' }),
      ...pinnedEdge,
      // A text cursor says a double-click edits; the edited cell gives its
      // padding to the field.
      Style.nest('&[data-editable]', { cursor: 'text' }),
      // Its cells, muted, with the ordinary pointer: there is nothing to type into.
      Style.nest('&[aria-readonly="true"]', { color: ref.text.muted, cursor: 'default' }),
      // On the cell, which clips what is in it.
      Style.nest('&[data-editing]', {
        boxShadow: ref.shadow.md,
        // Its error shows below it, past the cell.
        overflow: 'visible',
        paddingInline: '0',
        zIndex: '2',
      }),
      Style.nest('&[data-focused="true"]', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      // The cells a fill being dragged will write.
      Style.nest('&[data-fill="target"]', {
        outline: `${ref.border.thin} dashed ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thin})`,
      }),
      // A marked cell gets a dot in its top end corner. A background image,
      // after the pinned ground in the source, so a pinned cell keeps it, and
      // no geometry; an application styles its own marks by name.
      Style.nest('&[data-mark]', {
        backgroundImage: `radial-gradient(circle at calc(100% - 6px) 6px, ${ref.outline.focus} 3px, transparent 3.5px)`,
      }),
    ),
    editor: Style.compose(field, refused),
    // The combobox reads as the field it replaces: its draft on the line,
    // and room for the list it opens.
    choice: Style.compose(
      field,
      refused,
      Style.self({ display: 'flex', alignItems: 'center', cursor: 'default' }),
    ),
    // Placed by the view (`position` is the Slot's), below the cell or above it.
    choiceList: Style.compose(
      Style.self({
        zIndex: '3',
        minWidth: '100%',
        maxHeight: '16rem',
        overflowY: 'auto',
        margin: '0',
        padding: ref.space['3xs'],
        listStyle: 'none',
        background: ref.surface.base,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        boxShadow: ref.shadow.lg,
      }),
    ),
    choiceOption: Style.compose(
      Style.self({
        padding: `${ref.space['2xs']} ${ref.space.sm}`,
        borderRadius: ref.radius.sm,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }),
      Style.nest('&:hover', { background: ref.surface.subtle }),
      Style.nest('&[aria-selected="true"]', {
        background: ref.accent.subtle,
        color: ref.accent.ink,
      }),
      // A finger needs a target this tall.
      Style.media('(pointer: coarse)', {
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
      }),
    ),
    // Below the field, over the rows beneath: why the column refused the draft.
    editorError: Style.self({
      background: ref.error.default,
      borderRadius: ref.radius.md,
      boxShadow: ref.shadow.lg,
      color: ref.error['on-fill'],
      fontSize: ref.size.xs,
      fontWeight: ref.weight.medium,
      insetInlineStart: '0',
      paddingBlock: ref.space['3xs'],
      paddingInline: ref.space.xs,
      pointerEvents: 'none',
      position: 'absolute',
      top: `calc(100% + ${ref.space['3xs']})`,
      whiteSpace: 'nowrap',
      zIndex: '5',
    }),
    // The edge a column is resized by: the faint line between headers, which
    // darkens and thickens under the pointer, or while dragged.
    resizeHandle: Style.compose(
      Style.self({
        background: `linear-gradient(to right, transparent calc(100% - 1px), color-mix(in oklch, ${ref.outline.subtle} 70%, transparent) calc(100% - 1px))`,
      }),
      Style.pseudo(':hover', {
        background: `linear-gradient(to right, transparent calc(100% - 2px), ${ref.outline.focus} calc(100% - 2px))`,
      }),
    ),
    fillHandle: Style.self({
      width: '7px',
      height: '7px',
      background: ref.outline.focus,
      border: `1px solid ${ref.surface.base}`,
      cursor: 'crosshair',
      zIndex: '3',
    }),
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
        alignItems: 'center',
        background: 'none',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        font: 'inherit',
        gap: ref.space.xs,
        minWidth: '0',
        overflow: 'hidden',
        padding: '0',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      // A small chevron, drawn from two borders, after the label. Its place is
      // kept while unsorted, so sorting moves nothing; it shows faintly under
      // the pointer, to say the label sorts.
      Style.nest('&::after', {
        borderBlockEnd: `1.5px solid currentColor`,
        borderInlineEnd: `1.5px solid currentColor`,
        content: '""',
        flex: 'none',
        height: '0.4em',
        opacity: '0',
        transform: 'translateY(-0.15em) rotate(45deg)',
        transition: `opacity ${ref.motion.fast} ${ref.motion.ease}, transform ${ref.motion.fast} ${ref.motion.ease}`,
        width: '0.4em',
      }),
      Style.nest('&:hover::after', { opacity: '0.35' }),
      Style.nest('&[data-sort="desc"]::after', { opacity: '1' }),
      Style.nest('&[data-sort="asc"]::after', {
        opacity: '1',
        transform: 'translateY(0.1em) rotate(-135deg)',
      }),
    ),
    placeholder: Style.self({ background: ref.surface.subtle }),
    status: Style.self({ color: ref.text.muted, padding: ref.space.md }),
  },
  { layer: Layers.standard.layer('components') },
)
