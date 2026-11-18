import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// The page is the application's: `onPage` says where a press goes, and the
// control draws where it is. The window collapses a long run into an ellipsis.
export default example({
  title: 'Numbered',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 5 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      { page, pageCount: 12, onPage: page => onMessage(Message.Went({ page })), style },
      h,
    ),
})
