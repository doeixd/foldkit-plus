import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Badge, BadgeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, row, stack } from '../../snippets/layout.js'

const Model = Schema.Struct({ filters: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Dismissed: { filter: Schema.String } })

// `onDismiss` draws a button inside the pill, named by `words.dismiss` with
// the badge's text filled in. Whether the filter stays is the application's:
// the next draw leaves the badge out.
export default example({
  title: 'Dismissible',
  slots: BadgeSlots,
  recipe: Recipes.Badge,
  state: {
    Model,
    Message,
    init: () => ({ model: { filters: ['Design', 'Open', 'Assigned to me'] } }),
    update: (model, { filter }) => ({
      model: modifyFields(model, { filters: filters => filters.filter(each => each !== filter) }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    stack(h, [
      row(
        h,
        model.filters.map(filter =>
          Badge.view(
            { text: filter, onDismiss: onMessage(Message.Dismissed({ filter })), style },
            h,
          ),
        ),
      ),
      note(h, [`${model.filters.length} filters on`]),
    ]),
})
