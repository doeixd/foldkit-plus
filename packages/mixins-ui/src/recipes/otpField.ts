/**
 * A one-time code: cells a rung of the size ladder square, joined into runs
 * with a dash between them, the real input laid over them all with its own
 * text and caret clear. While the field has focus, the cell where the next
 * character goes takes the focus ring and a blinking caret of its own.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { OtpFieldSlots } from '../otpField.js'
import { component, ref, touchText } from './design.js'

const blink = Style.keyframes({ '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } })
const focused = ':where(:focus-within) > :where([aria-hidden]) > &[data-next]'

export const OtpField = Style.recipeFor(OtpFieldSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: ladder('gap'),
      }),
    ),
    // Over the cells, taking every press and key; its own text and caret clear.
    input: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        inlineSize: '100%',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: 'transparent',
        caretColor: 'transparent',
        font: 'inherit',
        outline: 'none',
        cursor: 'text',
      }),
      // Its text is clear, but iOS zooms into any focused field under 16px all the same.
      touchText,
      Style.pseudo('::selection', { background: 'transparent' }),
    ),
    // The cells are positioned, so they paint over the input: presses pass through them to it.
    group: component(Style.self({ display: 'flex', pointerEvents: 'none' })),
    cell: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        marginInlineStart: `calc(-1 * ${ref.border.thin})`,
        background: ref.surface.base,
        color: ref.text.overt,
        ...role('subtitle'),
        fontVariantNumeric: 'tabular-nums',
      }),
      Style.pseudo(':first-child', {
        marginInlineStart: '0',
        borderStartStartRadius: ref.radius.md,
        borderEndStartRadius: ref.radius.md,
      }),
      Style.pseudo(':last-child', {
        borderStartEndRadius: ref.radius.md,
        borderEndEndRadius: ref.radius.md,
      }),
      Style.nest(focused, {
        zIndex: '1',
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thin})`,
      }),
      blink.style,
      // An empty next cell draws the caret the input keeps clear.
      Style.nest(`${focused}[data-filled="false"]::after`, {
        content: '""',
        inlineSize: ref.border.thin,
        blockSize: '1.1em',
        background: ref.text.overt,
        animation: `${blink.name} 1s steps(1) infinite`,
      }),
    ),
    separator: component(
      Style.self({
        inlineSize: '0.6em',
        blockSize: ref.border.thick,
        borderRadius: ref.radius.full,
        background: ref.outline.overt,
      }),
    ),
  },
})
