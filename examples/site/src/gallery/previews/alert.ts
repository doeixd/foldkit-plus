import { AlertSlots, Recipes } from 'foldkit-mixins-ui'
import banner from '../../examples/alert/banner.js'
import dismiss from '../../examples/alert/dismiss.js'
import inline from '../../examples/alert/inline.js'
import tones from '../../examples/alert/tones.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

// One alert in a tile; the banner has its own example.
export const showcase = fromRecipe(about('alert'), AlertSlots, Recipes.Alert, inline, undefined, [
  { name: 'inline', example: inline },
  { name: 'banner', example: banner },
  { name: 'dismiss', example: dismiss },
  { name: 'tones', example: tones },
])
