import { Recipes, ToastSlots } from 'foldkit-mixins-ui'
import action from '../../examples/toast/action.js'
import invert from '../../examples/toast/invert.js'
import payload from '../../examples/toast/payload.js'
import positions from '../../examples/toast/positions.js'
import progress from '../../examples/toast/progress.js'
import promise from '../../examples/toast/promise.js'
import rich from '../../examples/toast/rich.js'
import types from '../../examples/toast/types.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('toast'), ToastSlots, Recipes.Toast, types, undefined, [
  { name: 'types', example: types },
  { name: 'promise', example: promise },
  { name: 'action', example: action },
  { name: 'rich', example: rich },
  { name: 'invert', example: invert },
  { name: 'positions', example: positions },
  { name: 'payload', example: payload },
  { name: 'progress', example: progress },
])
