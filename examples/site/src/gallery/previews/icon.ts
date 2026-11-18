import { IconSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/icon/basic.js'
import glyph from '../../examples/icon/glyph.js'
import mark from '../../examples/icon/mark.js'
import sizes from '../../examples/icon/sizes.js'
import tiles from '../../examples/icon/tiles.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('icon'),
  IconSlots,
  Recipes.Icon,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'sizes', example: sizes },
    { name: 'tiles', example: tiles },
    { name: 'glyph', example: glyph },
    { name: 'mark', example: mark },
  ],
  {
    shape: {
      axis: 'surface',
      values: ['outline', 'soft', 'solid', 'raised'],
      hint: 'A shape rounds a tile: pick a surface.',
    },
  },
)
