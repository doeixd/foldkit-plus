import { FileInput, FileInputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { fileList, Message } from '../../snippets/fileList.js'

// A single file replaces the last pick. `required` is the browser's own, and
// `invalid` with a `description` says why the form would not submit.
export default example({
  title: 'One file, required',
  slots: FileInputSlots,
  recipe: Recipes.FileInput,
  state: fileList('statement', { multiple: false }),
  view: ({ style, model, onMessage, h }) =>
    FileInput.view(
      {
        id: 'statement',
        name: 'statement',
        label: 'Choose a statement',
        description:
          model.files.length === 0
            ? 'A CSV file is required.'
            : 'One file; choosing again replaces it.',
        accept: ['.csv', 'text/csv'],
        required: true,
        invalid: model.files.length === 0,
        files: model.files,
        onChange: files => onMessage(Message.Picked({ files })),
        onRemove: file => onMessage(Message.Removed({ file })),
        style,
      },
      h,
    ),
})
