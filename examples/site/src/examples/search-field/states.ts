import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Recipes, SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Field = Schema.Literals(['order', 'docs'])
const Model = Schema.Struct({ order: Schema.String, docs: Schema.String })
const Message = defineMessageUnion({ Typed: { field: Field, text: Schema.String } })

// Invalid names a field that cannot be searched yet. A disabled field takes
// no text or keys and draws no clear button. With no `clear` there is no
// button and Escape is left to the page.
export default example({
  title: 'Invalid, disabled and with no clear',
  slots: SearchFieldSlots,
  recipe: Recipes.SearchField,
  state: {
    Model,
    Message,
    init: () => ({ model: { order: 'ord-', docs: 'focus' } }),
    update: (model, { field, text }) => ({
      model:
        field === 'order'
          ? modifyFields(model, { order: () => text })
          : modifyFields(model, { docs: () => text }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(
      h,
      [
        SearchField.view(
          {
            id: 'order',
            label: 'Search by order number',
            value: model.order,
            invalid: true,
            onInput: text => onMessage(Message.Typed({ field: 'order', text })),
            style,
          },
          h,
        ),
        SearchField.view(
          {
            id: 'archive',
            label: 'Search the archive',
            value: 'lamps',
            disabled: true,
            onInput: text => onMessage(Message.Typed({ field: 'docs', text })),
            style,
          },
          h,
        ),
        SearchField.view(
          {
            id: 'docs',
            label: 'Search the docs',
            value: model.docs,
            onInput: text => onMessage(Message.Typed({ field: 'docs', text })),
            style,
          },
          h,
        ),
      ],
      [h.Style({ alignItems: 'stretch', inlineSize: 'min(20rem, 100%)' })],
    ),
})
