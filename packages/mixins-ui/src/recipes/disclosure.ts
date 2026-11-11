/**
 * A disclosure: one button that shows and hides one panel, `@foldkit/ui`'s
 * Disclosure. The button is a row, and its chevron is drawn on the button
 * itself, since the disclosure has no slot for one: down while shut, up
 * once open (upstream's `data-open`). The panel's box is the recipe's;
 * whether it is drawn, and its height as it opens, are upstream's: draw the
 * panel only while open, or through `animatePanel`, which keeps a shut panel
 * inert and moves its height by an inline transition (200ms, easing out, so
 * it never passes its end) that neither the `motion` knob nor reduced motion
 * reaches.
 *
 * The axes:
 *
 * - `variant`: `plain` (the default) flush with the page; `bordered` one box
 *   round the button and the panel, the button's lower corners squaring
 *   onto the panel while open; `ghost` a button that fills under the
 *   pointer and nowhere else.
 * - `indicator`: `chevron` (the default), or `none` for a button that draws
 *   its own icon.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { DisclosureSlots } from '../disclosure.js'
import {
  component,
  controlHeight,
  disabled,
  focusRing,
  hover,
  ref,
  transition,
  triggerChevron,
  unfilledHover,
  variant,
} from './design.js'

const open = '&[data-open]'
const edge = `${ref.border.thin} solid ${ref.outline.default}`

export const Disclosure = Style.recipeFor(DisclosureSlots)({
  base: {
    button: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ladder('gap'),
        inlineSize: '100%',
        minBlockSize: controlHeight,
        paddingBlock: ladder('row-pad'),
        paddingInline: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('color, background-color'),
      }),
      hover({ color: ref.text.overt }),
      Style.nest(open, { color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    panel: component(
      Style.self({
        paddingBlockEnd: ladder('row-pad'),
        paddingInline: '0',
        color: ref.text.muted,
        ...role('body'),
      }),
    ),
  },
  variants: {
    variant: {
      plain: {},
      bordered: {
        button: variant(
          Style.self({
            paddingInline: ladder('row-pad'),
            border: edge,
            borderRadius: ref.radius.lg,
          }),
          // Longhands, so the corners left round are the base's.
          Style.nest(open, { borderEndStartRadius: '0', borderEndEndRadius: '0' }),
        ),
        panel: variant(
          Style.self({
            paddingBlockStart: ladder('row-pad'),
            paddingInline: ladder('row-pad'),
            borderInline: edge,
            borderBlockEnd: edge,
            borderEndStartRadius: ref.radius.lg,
            borderEndEndRadius: ref.radius.lg,
          }),
        ),
      },
      ghost: {
        button: variant(
          Style.self({ paddingInline: ladder('row-pad'), borderRadius: ref.radius.md }),
          hover({ background: unfilledHover }),
        ),
        panel: variant(Style.self({ paddingInline: ladder('row-pad') })),
      },
    },
    indicator: {
      chevron: {
        button: variant(
          triggerChevron(open, '0.45em', '::after'),
          Style.nest('&::after', { color: ref.text.muted }),
        ),
      },
      none: {},
    },
  },
  defaults: { variant: 'plain', indicator: 'chevron' },
})
