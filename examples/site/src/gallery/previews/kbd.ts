import { KbdSlots, Recipes } from 'foldkit-mixins-ui'
import combo from '../../examples/kbd/combo.js'
import glyphs from '../../examples/kbd/glyphs.js'
import key from '../../examples/kbd/key.js'
import shortcut from '../../examples/kbd/shortcut.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('kbd'), KbdSlots, Recipes.Kbd, key, undefined, [
  { name: 'key', example: key },
  { name: 'combo', example: combo },
  { name: 'glyphs', example: glyphs },
  { name: 'shortcut', example: shortcut },
])
