/**
 * A password field: Input's label, description and control inside
 * InputGroup's one bordered box, with the toggle a square at its end. The
 * toggle draws an eye from `Icons.glyph`, struck through while the password
 * shows (`aria-pressed="true"`); set `--icon` on the toggle for another.
 * `size` steps the ladder for the whole field, the toggle with it. Under
 * the field, the Caps Lock hint in the warning's ink, the strength Meter,
 * and the requirements as a quiet list, each marked with a ring, filled
 * and in the success ink once met; the state in words is read, not seen.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
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
      byAttribute('aria-pressed', { false: ref.icon.eye, true: ref.icon['eye-off'] }),
      hover({ background: unfilledHover, color: ref.text.overt }),
      // Inside the group's own ring, so the two do not draw over each other.
      Style.pseudo(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      disabled,
    ),
    capsLock: component(
      Style.self({
        margin: '0',
        marginBlockStart: ref.space['2xs'],
        color: ref.warning.ink,
        ...role('caption'),
      }),
    ),
    strength: component(Style.self({ marginBlockStart: ref.space.xs })),
    requirements: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        margin: '0',
        marginBlockStart: ref.space.xs,
        padding: '0',
        listStyle: 'none',
        color: ref.text.muted,
        ...role('caption'),
      }),
    ),
    requirement: component(
      Style.self({ display: 'flex', alignItems: 'center', gap: ref.space['2xs'] }),
      Style.pseudo('::before', {
        content: '""',
        flexShrink: '0',
        inlineSize: '0.75em',
        blockSize: '0.75em',
        boxSizing: 'border-box',
        border: `${ref.border.thin} solid currentColor`,
        borderRadius: ref.radius.full,
        ...transition('background-color, border-color'),
      }),
      Style.states({ true: { color: ref.success.ink } }, 'data-met'),
      Style.nest('&[data-met="true"]::before', { background: 'currentColor' }),
    ),
    requirementState: component(Utilities.srOnly),
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
