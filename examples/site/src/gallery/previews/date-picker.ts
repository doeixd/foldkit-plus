import { DatePickerSlots, Recipes } from 'foldkit-mixins-ui'
import bundle from '../../examples/date-picker/bundle.js'
import presets from '../../examples/date-picker/presets.js'
import range from '../../examples/date-picker/range.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('date-picker'),
  DatePickerSlots,
  Recipes.DatePicker,
  bundle,
  undefined,
  [
    { name: 'bundle', example: bundle },
    { name: 'range', example: range },
    { name: 'presets', example: presets },
  ],
)
