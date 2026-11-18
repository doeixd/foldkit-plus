import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'
import { copyText } from 'foldkit-primitives/dom'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ copied: Schema.Boolean })
// `Copied` and `CopyFailed` are what `copyText`'s Command answers.
const Message = defineMessageUnion({
  PressedCopy: { code: Schema.String },
  Copied: {},
  CopyFailed: { message: Schema.String },
})

// The button sends what `onCopy` makes of the code; `update` runs `copyText`
// from `foldkit-primitives` and draws `copied: true` once it answers.
export default example({
  title: 'The copy button',
  slots: CodeBlockSlots,
  recipe: Recipes.CodeBlock,
  state: {
    Model,
    Message,
    init: () => ({ model: { copied: false } }),
    update: (model, message) =>
      Message.match(message, {
        PressedCopy: ({ code }) => ({ model, commands: [copyText(code)] }),
        Copied: () => ({ model: model.copied ? model : { copied: true } }),
        CopyFailed: () => ({ model }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    CodeBlock.view(
      {
        code: 'npm install foldkit-plus',
        language: 'sh',
        copy: {
          copied: model.copied,
          onCopy: code => onMessage(Message.PressedCopy({ code })),
        },
        style,
      },
      h,
    ),
})
