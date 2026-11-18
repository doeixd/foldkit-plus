import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Recipes, SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ query: Schema.String })
const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  Cleared: {},
  Focused: {},
})

// The text is the application's. `clear` draws the button, and Escape sends
// the same Message; its answer puts focus back, since the pressed button
// takes its focus with it when it goes.
export default example({
  title: 'Basic',
  slots: SearchFieldSlots,
  recipe: Recipes.SearchField,
  state: {
    Model,
    Message,
    init: () => ({ model: { query: '' } }),
    update: (model, message) =>
      Message.match(message, {
        Typed: ({ text }) => ({ model: modifyFields(model, { query: () => text }) }),
        Cleared: () => ({
          model: modifyFields(model, { query: () => '' }),
          commands: Command.mapMessages([SearchField.Focus({ id: 'find' })], () =>
            Message.Focused(),
          ),
        }),
        Focused: () => ({ model }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    SearchField.view(
      {
        id: 'find',
        label: 'Search products',
        placeholder: 'Search products',
        value: model.query,
        onInput: text => onMessage(Message.Typed({ text })),
        clear: { onClear: onMessage(Message.Cleared()) },
        style,
      },
      h,
    ),
})
