import type { NamedStyle } from 'foldkit-mixins'
import { ColorPickerSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const colorInline = <Message>(style: NamedStyle<typeof ColorPickerSlots>, live: Live<Message>) =>
  Snippet.colorPicker(
    style,
    live.widgets.accent,
    message => live.onWidget(Widgets.Message.GotAccent({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('color-picker'),
  ColorPickerSlots,
  Recipes.ColorPicker,
  colorInline,
  undefined,
  [
    { name: 'inline', title: 'Inline', draw: colorInline },
    {
      name: 'popover',
      title: 'In a popover',
      draw: (style, live) =>
        Snippet.colorPickerPopover(
          style,
          { picker: live.widgets.brand, popover: live.widgets.brandPopover },
          message => live.onWidget(Widgets.Message.GotBrand({ message })),
          message => live.onWidget(Widgets.Message.GotBrandPopover({ message })),
          live.h,
        ),
    },
  ],
)
