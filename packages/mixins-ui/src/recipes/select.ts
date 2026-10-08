/**
 * A native select: the same control look as a text field, with room for the
 * value. `size` and `variant` match the Input recipe's axes.
 */
import { Style } from 'foldkit-mixins'
import { SelectSlots } from '../select.js'
import { component, disabled, focusRing, ref, transition, variant } from './design.js'

const size = (block: string, inline: string, font: string) =>
  variant(Style.self({ paddingBlock: block, paddingInline: `${inline} 2rem`, fontSize: font }))

export const Select = Style.recipeFor(SelectSlots)({
  base: {
    select: component(
      Style.self({
        display: 'block',
        inlineSize: '100%',
        paddingBlock: ref.space.xs,
        paddingInline: `${ref.space.sm} 2rem`,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
        lineHeight: ref.leading.normal,
        appearance: 'none',
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
      focusRing,
      disabled,
    ),
    label: component(
      Style.self({
        display: 'block',
        marginBlockEnd: ref.space['2xs'],
        color: ref.text.overt,
        fontSize: ref.size.sm,
        fontWeight: ref.weight.medium,
      }),
    ),
    description: component(
      Style.self({
        marginBlockStart: ref.space['2xs'],
        color: ref.text.muted,
        fontSize: ref.size.sm,
      }),
    ),
  },
  variants: {
    size: {
      sm: { select: size(ref.space['2xs'], ref.space.xs, ref.size.sm) },
      md: { select: size(ref.space.xs, ref.space.sm, ref.size.md) },
      lg: { select: size(ref.space.sm, ref.space.md, ref.size.lg) },
    },
    variant: {
      outline: {
        select: variant(Style.self({ background: ref.surface.base })),
      },
      filled: {
        select: variant(
          Style.self({ background: ref.surface.subtle, borderColor: 'transparent' }),
        ),
      },
    },
  },
  defaults: { size: 'md', variant: 'outline' },
})
