import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, FileDropSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const fileDropBasic = <Message>(style: NamedStyle<typeof FileDropSlots>, live: Live<Message>) =>
  Snippet.fileDrop(
    style,
    { drop: live.widgets.drop, attached: live.widgets.attachments },
    message => live.onWidget(Widgets.Message.GotDrop({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('file-drop'),
  FileDropSlots,
  Recipes.FileDrop,
  fileDropBasic,
  undefined,
  [{ name: 'basic', title: 'Dropped files', draw: fileDropBasic }],
)
