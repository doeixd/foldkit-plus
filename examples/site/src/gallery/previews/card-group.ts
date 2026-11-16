import type { NamedStyle } from 'foldkit-mixins'
import { CardGroupSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const cardPlans = <Message>(style: NamedStyle<typeof CardGroupSlots>, live: Live<Message>) =>
  Snippet.cardGroup(style, { chosen: live.chosen, onChoose: live.onChoose }, live.h)

export const showcase = fromRecipe(
  about('card-group'),
  CardGroupSlots,
  Recipes.CardGroup,
  cardPlans,
  undefined,
  [
    { name: 'plans', title: 'Plans', draw: cardPlans },
    {
      name: 'grid',
      title: 'A grid',
      draw: (style, live) =>
        Snippet.cardGroupGrid(
          style,
          {
            chosen: live.widgets.region,
            onChoose: region => live.onWidget(Widgets.Message.ChoseRegion({ region })),
          },
          live.h,
        ),
      pins: { layout: 'separated' },
    },
  ],
)
