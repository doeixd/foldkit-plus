import { RadioGroupSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('radio-group'),
  RadioGroupSlots,
  Recipes.RadioGroup,
  (style, live) =>
    Snippet.radioGroup(
      style,
      { group: live.widgets.billingGroup, billing: live.widgets.billing },
      message => live.onWidget(Widgets.Message.GotBillingGroup({ message })),
      live.h,
    ),
  undefined,
  [
    {
      name: 'descriptions',
      title: 'Descriptions',
      draw: (style, live) =>
        Snippet.radioGroup(
          style,
          { group: live.widgets.billingGroup, billing: live.widgets.billing },
          message => live.onWidget(Widgets.Message.GotBillingGroup({ message })),
          live.h,
        ),
    },
    {
      name: 'horizontal',
      title: 'Horizontal',
      draw: (style, live) =>
        Snippet.radioGroupHorizontal(
          style,
          { group: live.widgets.billingRow, billing: live.widgets.billing },
          message => live.onWidget(Widgets.Message.GotBillingRow({ message })),
          live.h,
        ),
    },
    {
      name: 'cards',
      title: 'Cards',
      pins: { variant: 'card' },
      draw: (style, live) =>
        Snippet.radioGroup(
          style,
          { group: live.widgets.billingCards, billing: live.widgets.billing },
          message => live.onWidget(Widgets.Message.GotBillingCards({ message })),
          live.h,
        ),
    },
  ],
)
