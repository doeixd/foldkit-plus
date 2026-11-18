import { ColorPickerSlots, Recipes } from 'foldkit-mixins-ui'
import configure from '../../examples/color-picker/configure.js'
import inline from '../../examples/color-picker/inline.js'
import popover from '../../examples/color-picker/popover.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('color-picker'),
  ColorPickerSlots,
  Recipes.ColorPicker,
  inline,
  undefined,
  [
    { name: 'inline', example: inline },
    { name: 'popover', example: popover },
    { name: 'configure', example: configure },
  ],
)
