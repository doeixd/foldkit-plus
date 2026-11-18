import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// `shape: 'round'` makes each stop a pill, and `treatment: 'outline'` gives
// each the field's outline. Both are CSS over the same markup.
export default example({
  title: 'Round and outlined',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  pins: { shape: 'round', treatment: 'outline' },
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 4 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      { page, pageCount: 9, onPage: page => onMessage(Message.Went({ page })), style },
      h,
    ),
})
