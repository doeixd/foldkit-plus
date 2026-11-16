import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ToolbarSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const toolbarBasic = <Message>(style: NamedStyle<typeof ToolbarSlots>, live: Live<Message>) =>
  Snippet.toolbar(
    style,
    live.widgets.fields.toolbar,
    {
      onFocus: id => fields(live, Fields.Message.FocusedTool({ id })),
      onPress: id => fields(live, Fields.Message.PressedTool({ id })),
    },
    live.direction,
    live.h,
  )

export const showcase = fromRecipe(
  about('toolbar'),
  ToolbarSlots,
  Recipes.Toolbar,
  toolbarBasic,
  undefined,
  [{ name: 'basic', title: 'Formatting', draw: toolbarBasic }],
)
