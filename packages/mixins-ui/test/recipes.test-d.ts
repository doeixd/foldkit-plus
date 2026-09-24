/**
 * Compile-time recipe contracts. Type-checked, not executed.
 */
import { token } from '../src/recipes/design.js'
import { Recipes } from '../src/index.js'

token('surface', 'overt')
token('space', 'md')

// @ts-expect-error a token the palette does not define.
token('surface', 'shiny')

// @ts-expect-error a group neither the scales nor the palette have.
token('shadow', 'md')

Recipes.Button({ tone: 'danger', variant: 'ghost', size: 'sm' })

// @ts-expect-error a tone the recipe does not offer.
Recipes.Button({ tone: 'brand' })

// @ts-expect-error Button's recipe has no `open` axis.
Recipes.Dialog({ size: 'md', open: 'yes' })
