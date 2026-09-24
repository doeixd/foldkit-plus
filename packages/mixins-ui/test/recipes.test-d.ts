/**
 * Compile-time recipe contracts. Type-checked, not executed.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { token } from '../src/recipes/design.js'
import { ButtonSlots, Recipes } from '../src/index.js'

token('surface', 'overt')
token('space', 'md')

// @ts-expect-error a token the palette does not define.
token('surface', 'shiny')

// @ts-expect-error a group neither the scales nor the palette have.
token('shadow', 'md')

Recipes.Button({ tone: 'danger', variant: 'ghost', size: 'sm' })

// @ts-expect-error a tone the recipe does not offer.
Recipes.Button({ tone: 'brand' })

// @ts-expect-error Dialog's recipe has no `open` axis.
Recipes.Dialog({ size: 'md', open: 'yes' })

// The README's Recipes section, kept compiling.
const DeleteStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' }),
)
const L = Layers.standard
const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })
const _sheet: string = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(palette)),
  DeleteStyle,
)
void _sheet
const _brand = Recipes.Button.extend({
  base: { button: Style.class('brand-button') },
  variants: { size: { lg: { button: Style.class('brand-button-lg') } } },
})
void _brand
