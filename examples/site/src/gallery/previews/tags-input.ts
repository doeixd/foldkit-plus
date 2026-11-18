import { TagsInputSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/tags-input/basic.js'
import configure from '../../examples/tags-input/configure.js'
import max from '../../examples/tags-input/max.js'
import refusals from '../../examples/tags-input/refusals.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('tags-input'),
  TagsInputSlots,
  Recipes.TagsInput,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'max', example: max },
    { name: 'refusals', example: refusals },
    { name: 'configure', example: configure },
  ],
)
