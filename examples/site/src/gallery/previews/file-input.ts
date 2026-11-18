import { FileInputSlots, Recipes } from 'foldkit-mixins-ui'
import multiple from '../../examples/file-input/multiple.js'
import required from '../../examples/file-input/required.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('file-input'),
  FileInputSlots,
  Recipes.FileInput,
  multiple,
  undefined,
  [
    { name: 'multiple', example: multiple },
    { name: 'required', example: required },
  ],
)
