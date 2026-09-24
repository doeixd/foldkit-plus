/**
 * Text fields: `Input` and `Textarea` publish the same regions under
 * different control names, so both recipes are built from these pieces.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { InputSlots } from '../input.js'
import { TextareaSlots } from '../textarea.js'
import { component, disabled, focusRing, ref, transition, variant } from './design.js'

const control = component(
  Style.self({
    display: 'block',
    inlineSize: '100%',
    border: `${ref.border.thin} solid ${ref.outline.default}`,
    borderRadius: ref.radius.md,
    background: ref.surface.base,
    color: ref.text.default,
    font: 'inherit',
    lineHeight: ref.leading.normal,
    ...transition('border-color, background-color'),
  }),
  Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
  Style.pseudo('::placeholder', { color: ref.text.muted }),
  Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
  focusRing,
  disabled,
)

const label = component(
  Style.self({
    display: 'block',
    marginBlockEnd: ref.space['2xs'],
    color: ref.text.overt,
    fontSize: ref.size.sm,
    fontWeight: ref.weight.medium,
  }),
)

const description = component(
  Style.self({
    marginBlockStart: ref.space['2xs'],
    color: ref.text.muted,
    fontSize: ref.size.sm,
  }),
)

const size = (block: string, inline: string, font: string) =>
  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

const sizes = {
  sm: size(ref.space['2xs'], ref.space.xs, ref.size.sm),
  md: size(ref.space.xs, ref.space.sm, ref.size.md),
  lg: size(ref.space.sm, ref.space.md, ref.size.lg),
} as const

const filled: StyleValue = variant(
  Style.self({ background: ref.surface.subtle, borderColor: 'transparent' }),
)
const outlined: StyleValue = variant(Style.self({ background: ref.surface.base }))

export const Input = Style.recipeFor(InputSlots)({
  base: { input: control, label, description },
  variants: {
    size: { sm: { input: sizes.sm }, md: { input: sizes.md }, lg: { input: sizes.lg } },
    variant: { outline: { input: outlined }, filled: { input: filled } },
  },
  defaults: { size: 'md', variant: 'outline' },
})

export const Textarea = Style.recipeFor(TextareaSlots)({
  base: {
    textarea: Style.compose(control, component(Style.self({ resize: 'vertical' }))),
    label,
    description,
  },
  variants: {
    size: { sm: { textarea: sizes.sm }, md: { textarea: sizes.md }, lg: { textarea: sizes.lg } },
    variant: { outline: { textarea: outlined }, filled: { textarea: filled } },
  },
  defaults: { size: 'md', variant: 'outline' },
})
