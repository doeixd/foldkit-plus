/**
 * A button: `tone` picks the colors, `variant` how they are applied, `size`
 * the density. Tone and variant are independent because a tone only sets the
 * private custom properties the variants read.
 */
import { Style } from 'foldkit-mixins'
import { ButtonSlots } from '../button.js'
import {
  component,
  disabled,
  focusRing,
  self,
  token,
  tones,
  toneVar,
  transition,
  variant,
  whenEnabled,
} from './design.js'

const size = (block: string, inline: string, font: string) =>
  variant(self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

export const Button = Style.recipeFor(ButtonSlots)({
  base: {
    button: component(
      self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: token('space', 'xs'),
        border: `${token('border', 'thin')} solid transparent`,
        borderRadius: token('radius', 'md'),
        font: 'inherit',
        fontWeight: token('weight', 'medium'),
        lineHeight: token('leading', 'tight'),
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
          self({ background: toneVar('fill'), color: toneVar('on-fill') }),
          whenEnabled(':hover', { background: toneVar('fill-hover') }),
        ),
      },
      outline: {
        button: variant(
          self({ background: 'transparent', color: toneVar('ink'), borderColor: toneVar('fill') }),
          whenEnabled(':hover', { background: toneVar('wash') }),
        ),
      },
      ghost: {
        button: variant(
          self({ background: 'transparent', color: toneVar('ink') }),
          whenEnabled(':hover', { background: toneVar('wash') }),
        ),
      },
    },
    size: {
      sm: { button: size(token('space', '2xs'), token('space', 'sm'), token('size', 'sm')) },
      md: { button: size(token('space', 'xs'), token('space', 'md'), token('size', 'md')) },
      lg: { button: size(token('space', 'sm'), token('space', 'lg'), token('size', 'lg')) },
    },
  },
  defaults: { tone: 'accent', variant: 'solid', size: 'md' },
  compound: [
    {
      // A destructive primary action announces itself on focus too.
      when: { tone: 'danger', variant: 'solid' },
      style: {
        button: variant(
          Style.pseudo(':focus-visible', { outlineColor: token('error', 'outline') }),
        ),
      },
    },
    {
      // A small ghost button sits in dense toolbars: trim it to its label.
      when: { variant: 'ghost', size: 'sm' },
      style: { button: variant(self({ paddingInline: token('space', '2xs') })) },
    },
  ],
})
