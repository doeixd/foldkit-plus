import { mapMessage } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { ClipboardMessage, copyText } from '../../src/dom/index.js'

const Message = defineMessageUnion({
  CopyClicked: {},
  Clipboard: { message: ClipboardMessage },
})
type Model = { readonly text: string; readonly status: string }

const update = (model: Model, message: typeof Message.Type) =>
  Message.match(message, {
    CopyClicked: () => ({
      model,
      commands: [mapMessage(copyText(model.text), message => Message.Clipboard({ message }))],
    }),
    Clipboard: ({ message }) => ({
      model: {
        ...model,
        status: ClipboardMessage.match(message, {
          Copied: () => 'Copied',
          CopyFailed: ({ message }) => message,
        }),
      },
    }),
  })

void update
