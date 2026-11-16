import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, MarqueeSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const marqueeBasic = <Message>(style: NamedStyle<typeof MarqueeSlots>, live: Live<Message>) =>
  Snippet.marquee(
    style,
    live.widgets.customers,
    message => live.onWidget(Widgets.Message.GotCustomers({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('marquee'),
  MarqueeSlots,
  Recipes.Marquee,
  marqueeBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: marqueeBasic },
    {
      name: 'vertical',
      title: 'Vertical',
      draw: (style, live) =>
        Snippet.marqueeVertical(
          style,
          live.widgets.news,
          message => live.onWidget(Widgets.Message.GotNews({ message })),
          live.h,
        ),
    },
  ],
)
