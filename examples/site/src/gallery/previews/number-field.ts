import type { NamedStyle } from 'foldkit-mixins'
import { NumberFieldSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const numberBasic = <Message>(style: NamedStyle<typeof NumberFieldSlots>, live: Live<Message>) =>
  Snippet.numberField(
    style,
    live.widgets.servings,
    value => live.onWidget(Widgets.Message.ChangedServings({ value })),
    live.h,
  )

export const showcase = fromRecipe(
  about('number-field'),
  NumberFieldSlots,
  Recipes.NumberField,
  numberBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: numberBasic },
    {
      name: 'locale',
      title: 'Empty, and in a locale',
      draw: (style, live) =>
        Snippet.numberFieldLocale(
          style,
          live.widgets.fields.price,
          value => fields(live, Fields.Message.ChangedPrice({ value })),
          live.h,
        ),
    },
  ],
)
