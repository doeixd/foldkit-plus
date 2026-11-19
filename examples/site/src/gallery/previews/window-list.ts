import { Recipes, WindowListSlots } from 'foldkit-mixins-ui'
import basic from '../../examples/window-list/basic.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

// A window list scrolls with the page, so a card cannot hold a live one: it
// would window over the gallery's own scroll and draw the spacers of its
// thousand rows. The card shows the first rows and says so; the page has the
// live list.
const thumbnail = <Message>(_: unknown, { h }: Live<Message>) =>
  h.div(
    [],
    [
      ...Array.from({ length: 5 }, (_, index) => h.p([], [`Town ${index + 1}`])),
      h.p([], ['… 995 more, drawn as the page scrolls past them. Open the page to try it.']),
    ],
  )

export const showcase = fromRecipe(
  about('window-list'),
  WindowListSlots,
  Recipes.WindowList,
  thumbnail,
  undefined,
  [{ name: 'basic', example: basic }],
)
