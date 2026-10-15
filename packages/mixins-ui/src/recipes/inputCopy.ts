/**
 * An input with a copy button: a label over one bordered box, a rung of the
 * size ladder tall, the value in monospace beside the button, a hairline
 * between them. Copied, the button's text turns the success ink; the status
 * region is read, not seen, since the button already shows it.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { InputCopySlots } from '../inputCopy.js'
import { component, focusRing, ref, touchText, transition, unfilledHover } from './design.js'

// The group's corner inside its border: the input and button round their
// outer corners to it, so a ring drawn inset follows the curve the group
// clips to, rather than a square corner cut off by it.
const inner = `calc(${ref.radius.md} - ${ref.border.thin})`

export const InputCopy = Style.recipeFor(InputCopySlots)({
  base: {
    root: component(Style.self({ display: 'flex', flexDirection: 'column', gap: ladder('gap') })),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    group: component(
      Style.self({
        display: 'flex',
        alignItems: 'stretch',
        inlineSize: 'min(24rem, 100%)',
        minBlockSize: ladder('height'),
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        overflow: 'hidden',
      }),
    ),
    input: component(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        paddingBlock: '0',
        paddingInline: ladder('pad'),
        border: '0',
        borderStartStartRadius: inner,
        borderEndStartRadius: inner,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontFamily: ref.font.mono,
        ...role('body'),
        textOverflow: 'ellipsis',
      }),
      // Inset, since the group clips what would sit outside it.
      Style.pseudo(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      touchText,
    ),
    button: component(
      Style.self({
        flex: 'none',
        paddingBlock: '0',
        paddingInline: ladder('pad'),
        border: '0',
        borderInlineStart: `${ref.border.thin} solid ${ref.outline.default}`,
        borderStartEndRadius: inner,
        borderEndEndRadius: inner,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        ...role('body'),
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover }),
      Style.pseudo('[data-copied="true"]', { color: ref.success.ink }),
      focusRing,
      Style.pseudo(':focus-visible', { outlineOffset: `calc(-1 * ${ref.border.thick})` }),
    ),
    status: component(Utilities.srOnly),
  },
})
