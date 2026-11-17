import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, TourSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const tourBasic = <Message>(style: NamedStyle<typeof TourSlots>, live: Live<Message>) =>
  Snippet.tour(
    style,
    live.widgets.tour,
    message => live.onWidget(Widgets.Message.GotTour({ message })),
    live.onWidget(Widgets.Message.StartedTour()),
    live.h,
  )

export const showcase = fromRecipe(about('tour'), TourSlots, Recipes.Tour, tourBasic, undefined, [
  { name: 'basic', title: 'Basic', draw: tourBasic },
])
