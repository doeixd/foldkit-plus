/**
 * A password field: Input's label, description and control inside
 * InputGroup's one bordered box, with the toggle a square at its end. The
 * toggle draws an eye from `Icons.glyph`, struck through while the password
 * shows (`aria-pressed="true"`); set `--icon` on the toggle for another.
 * `size` steps the ladder for the whole field, the toggle with it.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { byAttribute, glyph } from '../icons.js'
import { PasswordInputSlots } from '../passwordInput.js'
import { Input, InputGroup } from './field.js'
import {
  component,
  disabled,
  hover,
  ref,
  steps,
  transition,
  unfilledHover,
  variant,
} from './design.js'

/** A 24-unit stroked drawing as a mask: only its alpha counts, so the stroke's black is no color. */
const mask = (paths: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${paths}</svg>`,
  )}")`

const eye = "<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z'/><circle cx='12' cy='12' r='3'/>"

export const PasswordInput = Style.recipeFor(PasswordInputSlots)({
  base: {
    // Input without its variant axis: the group, not the control, draws the box.
    ...Input({ variant: null }),
    group: InputGroup.group,
    toggle: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        flexShrink: '0',
        alignSelf: 'stretch',
        inlineSize: ladder('height'),
        padding: '0',
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      glyph(ladder('icon')),
      byAttribute('aria-pressed', { false: mask(eye), true: mask(`${eye}<path d='M3 3l18 18'/>`) }),
      hover({ background: unfilledHover, color: ref.text.overt }),
      // Inside the group's own ring, so the two do not draw over each other.
      Style.pseudo(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      disabled,
    ),
  },
  variants: {
    size: { sm: { root: steps.sm }, md: { root: steps.md }, lg: { root: steps.lg } },
  },
}).extend({
  // Composed over Input's control, which the spread above already holds for this slot.
  base: {
    input: [
      InputGroup.control,
      variant(
        Style.self({ paddingInlineStart: ladder('pad') }),
        // Edge's own reveal button would sit beside the toggle.
        Style.pseudo('::-ms-reveal', { display: 'none' }),
      ),
    ],
  },
})
