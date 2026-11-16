import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, PickerSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const pickerBasic = <Message>(style: NamedStyle<typeof PickerSlots>, live: Live<Message>) =>
  Snippet.picker(
    style,
    live.widgets.fields,
    message => fields(live, Fields.Message.GotPicker({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('picker'),
  PickerSlots,
  Recipes.Picker,
  pickerBasic,
  undefined,
  [{ name: 'basic', title: 'Sort order', draw: pickerBasic }],
)
