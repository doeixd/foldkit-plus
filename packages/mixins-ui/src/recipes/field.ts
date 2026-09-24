/**
 * Text fields: `Input` and `Textarea` publish the same regions under
 * different control names, so both recipes are built from these pieces.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { InputSlots } from '../input.js'
import { TextareaSlots } from '../textarea.js'
import { component, disabled, focusRing, self, token, transition, variant } from './design.js'

const control = component(
  self({
    display: 'block',
    inlineSize: '100%',
    border: `${token('border', 'thin')} solid ${token('outline', 'default')}`,
    borderRadius: token('radius', 'md'),
    background: token('surface', 'base'),
    color: token('text', 'default'),
    font: 'inherit',
    lineHeight: token('leading', 'normal'),
    ...transition('border-color, background-color'),
  }),
  Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: token('outline', 'overt') }),
  Style.pseudo('::placeholder', { color: token('text', 'muted') }),
  Style.pseudo('[aria-invalid="true"]', { borderColor: token('error', 'outline') }),
  focusRing,
  disabled,
)

const label = component(
  self({
    display: 'block',
    marginBlockEnd: token('space', '2xs'),
    color: token('text', 'overt'),
    fontSize: token('size', 'sm'),
    fontWeight: token('weight', 'medium'),
  }),
)

const description = component(
  self({
    marginBlockStart: token('space', '2xs'),
    color: token('text', 'muted'),
    fontSize: token('size', 'sm'),
  }),
)

const size = (block: string, inline: string, font: string) =>
  variant(self({ paddingBlock: block, paddingInline: inline, fontSize: font }))

const sizes = {
  sm: size(token('space', '2xs'), token('space', 'xs'), token('size', 'sm')),
  md: size(token('space', 'xs'), token('space', 'sm'), token('size', 'md')),
  lg: size(token('space', 'sm'), token('space', 'md'), token('size', 'lg')),
} as const

const filled: StyleValue = variant(
  self({ background: token('surface', 'subtle'), borderColor: 'transparent' }),
)
const outlined: StyleValue = variant(self({ background: token('surface', 'base') }))

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
    textarea: Style.compose(control, component(self({ resize: 'vertical' }))),
    label,
    description,
  },
  variants: {
    size: { sm: { textarea: sizes.sm }, md: { textarea: sizes.md }, lg: { textarea: sizes.lg } },
    variant: { outline: { textarea: outlined }, filled: { textarea: filled } },
  },
  defaults: { size: 'md', variant: 'outline' },
})
