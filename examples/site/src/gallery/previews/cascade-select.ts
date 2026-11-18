import { CascadeSelectSlots, Recipes } from 'foldkit-mixins-ui'
import columns from '../../examples/cascade-select/columns.js'
import configure from '../../examples/cascade-select/configure.js'
import drill from '../../examples/cascade-select/drill.js'
import external from '../../examples/cascade-select/external.js'
import flat from '../../examples/cascade-select/flat.js'
import inline from '../../examples/cascade-select/inline.js'
import localized from '../../examples/cascade-select/localized.js'
import rows from '../../examples/cascade-select/rows.js'
import triggerText from '../../examples/cascade-select/trigger-text.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('cascade-select'),
  CascadeSelectSlots,
  Recipes.CascadeSelect,
  columns,
  undefined,
  [
    { name: 'columns', example: columns },
    { name: 'drill', example: drill },
    { name: 'localized', example: localized },
    { name: 'rows', example: rows },
    { name: 'trigger-text', example: triggerText },
    { name: 'inline', example: inline },
    { name: 'external', example: external },
    { name: 'flat', example: flat },
    { name: 'configure', example: configure },
  ],
)
