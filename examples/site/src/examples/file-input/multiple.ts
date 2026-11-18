import { FileInput, FileInputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { fileList, Message } from '../../snippets/fileList.js'

// The application owns the list (`fileList` holds it and writes it back into
// the input); the trigger is the input's `label`, so a press opens the
// browser's dialog with no script between. A second pick adds to the list.
export default example({
  title: 'Several files',
  slots: FileInputSlots,
  recipe: Recipes.FileInput,
  state: fileList('attachments', { multiple: true }),
  view: ({ style, model, onMessage, h }) =>
    FileInput.view(
      {
        id: 'attachments',
        name: 'attachments',
        label: 'Attach files',
        description: 'Images only, any number.',
        accept: ['image/*'],
        multiple: true,
        files: model.files,
        onChange: files => onMessage(Message.Picked({ files })),
        onRemove: file => onMessage(Message.Removed({ file })),
        words: { remove: 'Take {name} off' },
        style,
      },
      h,
    ),
})
