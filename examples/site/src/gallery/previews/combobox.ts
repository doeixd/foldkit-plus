import type { Combobox as UiCombobox } from '@foldkit/ui'
import { ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/combobox/basic.js'
import choice from '../../examples/combobox/choice.js'
import clear from '../../examples/combobox/clear.js'
import groups from '../../examples/combobox/groups.js'
import multiple from '../../examples/combobox/multiple.js'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const cityMessage =
  <Message>(live: Live<Message>, example: Widgets.CityExample) =>
  (message: UiCombobox.Message) =>
    live.onWidget(Widgets.Message.GotCityBox({ example, message }))

export const showcase = fromRecipe(
  about('combobox'),
  ComboboxSlots,
  Recipes.Combobox,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'multiple', example: multiple },
    // These two stay regions until `Combobox.view` takes `creatable` and a loading state.
    {
      name: 'empty',
      title: 'Empty and loading',
      draw: (style, live) =>
        Snippet.comboboxEmpty(
          style,
          live.widgets.cityBoxes.empty,
          {
            on: live.widgets.cityLoading,
            onToggle: live.onWidget(Widgets.Message.ToggledCityLoading()),
          },
          cityMessage(live, 'empty'),
          live.h,
        ),
    },
    { name: 'clear', example: clear },
    { name: 'groups', example: groups },
    {
      name: 'creatable',
      title: 'Creatable',
      draw: (style, live) =>
        Snippet.comboboxCreatable(
          style,
          live.widgets.cityBoxes.creatable,
          live.widgets.createdCities,
          cityMessage(live, 'creatable'),
          live.h,
        ),
    },
    { name: 'choice', example: choice },
  ],
)
