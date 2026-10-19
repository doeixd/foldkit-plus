/**
 * A button group: one joined row or column, borders overlapping by exactly
 * the border width, inner corners squared and outer corners left to the
 * items. Only the joining sides are ever zeroed, so any radius still reads; a
 * lone item is untouched. An item that wraps the face it shows (a Menu's
 * wrapper around its trigger) passes the corners to its first element. A
 * hovered or focused item rises over its neighbours, so its border and focus
 * ring show whole at the seam, and a separated group's rule, drawn on the
 * seam itself, rises over both. `size` steps every item that has no size of
 * its own; `width: 'fill'` spans the container, a field taking the room the
 * buttons leave.
 */
import { Style } from 'foldkit-mixins'
import { ButtonGroupSlots } from '../buttonGroup.js'
import { component, onLadder, pressCorner, ref, steps, variant } from './design.js'

const overlap = `calc(-1 * ${ref.border.thin})`
const across = '&:not([data-orientation="vertical"])'
const down = '&[data-orientation="vertical"]'

/** `child` of the group, and the first element of a `child` that wraps its face. */
const face = (row: string, child: string) => `${row} > ${child}, ${row} > ${child} > :first-child`
const first = ':first-child:not(:only-child)'
const middle = '* + *:not(:last-child)'
const last = ':last-child:not(:only-child)'

export const ButtonGroup = Style.recipeFor(ButtonGroupSlots)({
  base: {
    root: component(
      Style.self({ display: 'inline-flex', alignItems: 'stretch' }),
      Style.nest(down, { flexDirection: 'column' }),
      Style.nest(`${across} > * + *`, { marginInlineStart: overlap }),
      Style.nest(`${down} > * + *`, { marginBlockStart: overlap }),
      Style.nest(face(across, first), { borderStartEndRadius: '0', borderEndEndRadius: '0' }),
      Style.nest(face(across, last), { borderStartStartRadius: '0', borderEndStartRadius: '0' }),
      Style.nest(face(down, first), { borderEndStartRadius: '0', borderEndEndRadius: '0' }),
      Style.nest(face(down, last), { borderStartStartRadius: '0', borderStartEndRadius: '0' }),
      Style.nest(face('&', middle), { borderRadius: '0' }),
      Style.nest('& > :hover', { position: 'relative', zIndex: '1' }),
      Style.nest('& > :focus-within', { position: 'relative', zIndex: '3' }),
    ),
    // On the seam the overlap makes, over both borders: one border wide.
    separator: component(
      Style.self({
        position: 'relative',
        zIndex: '2',
        flex: 'none',
        inlineSize: ref.border.thin,
        background: ref.outline.default,
      }),
      Style.nest('&[data-orientation="vertical"]', {
        inlineSize: 'auto',
        blockSize: ref.border.thin,
      }),
    ),
    text: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: pressCorner,
        background: ref.surface.muted,
        color: ref.text.muted,
        whiteSpace: 'nowrap',
      }),
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
    width: {
      // A field already spans what the row leaves, and gives way in a narrow one.
      fill: { root: variant(Style.self({ display: 'flex' })) },
    },
  },
})
