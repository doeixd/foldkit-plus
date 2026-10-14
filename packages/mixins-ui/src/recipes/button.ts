/**
 * A button: `tone` picks the colors, `variant` how they are applied, `size`
 * its step on the size ladder (unset, it follows the region it sits in). Tone
 * and variant are independent because a tone only sets the private custom
 * properties the variants read — except `primary`, which is ink by
 * definition, and `icon`, a square one rung of the ladder on a side.
 */
import { Style } from 'foldkit-mixins'
import { ButtonSlots } from '../button.js'
import { ladder } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  steps,
  tones,
  toneVar,
  transition,
  unfilledHover,
  variant,
} from './design.js'

/**
 * Text on a button with no fill: the tone's ink, unless a container drawn in a
 * color of its own sets `--fk-ink` (as it sets `--fk-heading`), where the ink
 * would not read.
 */
const unfilledInk = `var(--fk-ink, ${toneVar('ink')})`

export const Button = Style.recipeFor(ButtonSlots)({
  base: {
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid transparent`,
        borderRadius: ref.radius.md,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        lineHeight: ref.leading.tight,
        // A link drawn as a button (`Anchor`) is not underlined like one in running text.
        textDecoration: 'none',
        cursor: 'pointer',
        ...transition('background-color, border-color, color'),
      }),
      focusRing,
      disabled,
    ),
  },
  variants: {
    tone: {
      accent: { button: tones.accent },
      neutral: { button: tones.neutral },
      danger: { button: tones.danger },
    },
    variant: {
      solid: {
        button: variant(
          Style.self({ background: toneVar('fill'), color: toneVar('on-fill') }),
          hover({ background: toneVar('fill-hover') }),
        ),
      },
      outline: {
        button: variant(
          Style.self({
            background: 'transparent',
            color: unfilledInk,
            borderColor: toneVar('line'),
          }),
          hover({ background: unfilledHover }),
        ),
      },
      ghost: {
        button: variant(
          Style.self({ background: 'transparent', color: unfilledInk }),
          hover({ background: unfilledHover }),
        ),
      },
      /**
       * The main action, dark as the page's ink: tone-independent, so it reads
       * on any surface. Density still comes from `size`.
       */
      primary: {
        button: variant(
          Style.self({ background: ref.text.overt, color: ref.surface.base }),
          hover({
            background: `color-mix(in oklch, ${ref.text.overt} 85%, ${ref.surface.base})`,
          }),
        ),
      },
      /**
       * An icon with no words beside it: a square that centers its glyph. The
       * words stay the accessible name; only the icon shows, so label it with
       * `aria-label` or visually-hidden text.
       */
      icon: {
        button: variant(
          Style.self({
            background: 'transparent',
            color: ref.text.muted,
            inlineSize: ladder('height'),
            blockSize: ladder('height'),
            padding: '0',
            fontSize: '0',
            // The words are hidden, not gone: a gap beside them pushed the icon off center.
            gap: '0',
          }),
          hover({ background: unfilledHover, color: ref.text.overt }),
        ),
      },
    },
    size: {
      sm: { button: steps.sm },
      md: { button: steps.md },
      lg: { button: steps.lg },
    },
  },
  defaults: { tone: 'accent', variant: 'solid' },
  compound: [
    {
      // A destructive primary action announces itself on focus too.
      when: { tone: 'danger', variant: 'solid' },
      style: {
        button: variant(Style.pseudo(':focus-visible', { outlineColor: ref.error.outline })),
      },
    },
    {
      // A small ghost button sits in dense toolbars: trim it to its label.
      when: { variant: 'ghost', size: 'sm' },
      style: { button: variant(Style.self({ paddingInline: ref.space['2xs'] })) },
    },
  ],
})
