import { FieldsetSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/fieldset/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('fieldset'),
  FieldsetSlots,
  Recipes.Fieldset,
  basic,
  undefined,
  [{ name: 'basic', example: basic }],
)
