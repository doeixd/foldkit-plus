import { ScrollAreaSlots } from 'foldkit-mixins-ui'
import configure from '../../examples/scroll-area/configure.js'
import gutter from '../../examples/scroll-area/gutter.js'
import horizontal from '../../examples/scroll-area/horizontal.js'
import native, { Tall } from '../../examples/scroll-area/native.js'
import overlay from '../../examples/scroll-area/overlay.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(about('scroll-area'), ScrollAreaSlots, Tall, native, undefined, [
  { name: 'native', example: native },
  { name: 'overlay', example: overlay },
  { name: 'horizontal', example: horizontal },
  { name: 'gutter', example: gutter },
  { name: 'configure', example: configure },
])
