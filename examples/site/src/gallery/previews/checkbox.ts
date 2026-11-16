import type { NamedStyle } from 'foldkit-mixins'
import { CheckboxSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

// Each checkbox example holds its own state: one press toggles one box.
const checkboxBasic = <Message>(style: NamedStyle<typeof CheckboxSlots>, live: Live<Message>) =>
  Snippet.checkbox(
    style,
    live.widgets.terms,
    checked => live.onWidget(Widgets.Message.ToggledTerms({ checked })),
    live.h,
  )

export const showcase = fromRecipe(
  about('checkbox'),
  CheckboxSlots,
  Recipes.Checkbox,
  checkboxBasic,
  undefined,
  [
    {
      name: 'basic',
      title: 'Basic',
      draw: checkboxBasic,
    },
    {
      name: 'indeterminate',
      title: 'Indeterminate',
      draw: (style, live) =>
        Snippet.checkboxIndeterminate(
          style,
          live.widgets.toppings,
          checked => live.onWidget(Widgets.Message.ToggledToppings({ checked })),
          live.h,
        ),
    },
    {
      name: 'card',
      title: 'Card',
      draw: (style, live) =>
        Snippet.checkboxCard(
          style,
          live.widgets.teamPlan,
          checked => live.onWidget(Widgets.Message.ToggledTeamPlan({ checked })),
          live.h,
        ),
    },
  ],
)
