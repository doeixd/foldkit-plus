import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, FileInputSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Fields from '../fields.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import { fields } from '../previewShared.js'
import type { Live } from '../showcase.js'

const filesOf =
  (example: Fields.FilesExample, draw: typeof Snippet.fileInputMultiple) =>
  <Message>(style: NamedStyle<typeof FileInputSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.fields.files[example],
      {
        onChange: files => fields(live, Fields.Message.PickedFiles({ example, files })),
        onRemove: file => fields(live, Fields.Message.RemovedFile({ example, file })),
      },
      live.h,
    )

const filesMultiple = filesOf('multiple', Snippet.fileInputMultiple)

const filesRequired = filesOf('required', Snippet.fileInputRequired)

export const showcase = fromRecipe(
  about('file-input'),
  FileInputSlots,
  Recipes.FileInput,
  filesMultiple,
  undefined,
  [
    { name: 'multiple', title: 'Several files', draw: filesMultiple },
    { name: 'required', title: 'One file, required', draw: filesRequired },
  ],
)
