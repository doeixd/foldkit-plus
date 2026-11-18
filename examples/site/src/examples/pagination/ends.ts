import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// First and last beside previous and next.
export default example({
  title: 'First and last',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 8 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      { page, pageCount: 20, ends: true, onPage: page => onMessage(Message.Went({ page })), style },
      h,
    ),
})
