import { FigureSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/figure/basic.js'
import before from '../../examples/figure/before.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('figure'), FigureSlots, Recipes.Figure, basic, undefined, [
  { name: 'basic', example: basic },
  { name: 'before', example: before },
])
