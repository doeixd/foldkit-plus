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
  ref,
  tones,
  toneVar,
  transition,
  variant,
  hover,
} from './design.js'

const size = (block: string, inline: string, font: string) =>
  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

export const Button = Style.recipeFor(ButtonSlots)({
  base: {
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: ref.space.xs,
        border: `${ref.border.thin} solid transparent`,
        borderRadius: ref.radius.md,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        lineHeight: ref.leading.tight,
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
            color: toneVar('ink'),
            borderColor: toneVar('fill'),
          }),
          hover({ background: toneVar('wash') }),
        ),
      },
      ghost: {
        button: variant(
          Style.self({ background: 'transparent', color: toneVar('ink') }),
          hover({ background: toneVar('wash') }),
        ),
      },
    },
    size: {
      sm: { button: size(ref.space['2xs'], ref.space.sm, ref.size.sm) },
      md: { button: size(ref.space.xs, ref.space.md, ref.size.md) },
      lg: { button: size(ref.space.sm, ref.space.lg, ref.size.lg) },
    },
  },
  defaults: { tone: 'accent', variant: 'solid', size: 'md' },
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
