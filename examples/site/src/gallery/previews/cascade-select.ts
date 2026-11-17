import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, CascadeSelectSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const cascadeColumns = <Message>(
  style: NamedStyle<typeof CascadeSelectSlots>,
  live: Live<Message>,
) =>
  Snippet.cascadeSelect(
    style,
    live.widgets.cascade,
    message => live.onWidget(Widgets.Message.GotCascade({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('cascade-select'),
  CascadeSelectSlots,
  Recipes.CascadeSelect,
  cascadeColumns,
  undefined,
  [
    { name: 'columns', title: 'Columns', draw: cascadeColumns },
    {
      name: 'drill',
      title: 'One level at a time',
      draw: (style, live) =>
        Snippet.cascadeSelectDrill(
          style,
          live.widgets.cascadeDrill,
          message => live.onWidget(Widgets.Message.GotCascadeDrill({ message })),
          live.h,
        ),
    },
  ],
)
