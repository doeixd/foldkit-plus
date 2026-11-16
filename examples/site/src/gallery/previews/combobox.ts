import type { Combobox as UiCombobox } from '@foldkit/ui'
import type { NamedStyle } from 'foldkit-mixins'
import { ComboboxSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const cityMessage =
  <Message>(live: Live<Message>, example: Widgets.CityExample) =>
  (message: UiCombobox.Message) =>
    live.onWidget(Widgets.Message.GotCityBox({ example, message }))

const comboboxBasic = <Message>(style: NamedStyle<typeof ComboboxSlots>, live: Live<Message>) =>
  Snippet.combobox(
    style,
    live.widgets,
    message => live.onWidget(Widgets.Message.GotCombobox({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('combobox'),
  ComboboxSlots,
  Recipes.Combobox,
  comboboxBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: comboboxBasic },
    {
      name: 'multiple',
      title: 'Several, as chips',
      draw: (style, live) =>
        Snippet.comboboxMultiple(
          style,
          live.widgets.cityTags,
          message => live.onWidget(Widgets.Message.GotCityTags({ message })),
          live.h,
        ),
    },
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
    {
      name: 'clear',
      title: 'A clear button',
      draw: (style, live) =>
        Snippet.comboboxClear(
          style,
          live.widgets.cityBoxes.clear,
          cityMessage(live, 'clear'),
          live.h,
        ),
    },
    {
      name: 'groups',
      title: 'Groups',
      draw: (style, live) =>
        Snippet.comboboxGroups(
          style,
          live.widgets.cityBoxes.groups,
          cityMessage(live, 'groups'),
          live.h,
        ),
    },
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
  ],
)
