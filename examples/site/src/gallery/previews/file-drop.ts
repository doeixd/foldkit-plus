import { FileDropSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/file-drop/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('file-drop'),
  FileDropSlots,
  Recipes.FileDrop,
  basic,
  undefined,
  [{ name: 'basic', example: basic }],
)
