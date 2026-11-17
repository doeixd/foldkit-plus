import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, AngleSliderSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const angleBasic = <Message>(style: NamedStyle<typeof AngleSliderSlots>, live: Live<Message>) =>
  Snippet.angleSlider(
    style,
    live.widgets.heading,
    message => live.onWidget(Widgets.Message.GotHeading({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('angle-slider'),
  AngleSliderSlots,
  Recipes.AngleSlider,
  angleBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: angleBasic },
    {
      name: 'marks',
      title: 'Kept to marks',
      draw: (style, live) =>
        Snippet.angleSliderMarks(
          style,
          live.widgets.rotation,
          message => live.onWidget(Widgets.Message.GotRotation({ message })),
          live.h,
        ),
    },
  ],
)
