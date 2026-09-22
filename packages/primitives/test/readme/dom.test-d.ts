import { mapMessage } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { ClipboardMessage, copyText } from '../../src/dom/index.js'

const Message = defineMessageUnion({
  CopyClicked: {},
  Clipboard: { message: ClipboardMessage },
})
type Model = { readonly text: string; readonly status: string }

const update = (model: Model, message: typeof Message.Type) => {
  if (message._tag === 'CopyClicked') {
    return {
      model,
      commands: [mapMessage(copyText(model.text), message => Message.Clipboard({ message }))],
    }
  }
  return {
    model: {
      ...model,
      status: message.message._tag === 'Copied' ? 'Copied' : message.message.message,
    },
  }
}

void update
