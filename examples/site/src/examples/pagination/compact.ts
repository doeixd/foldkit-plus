import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// The current page and the count alone, at every width: "5 / 12". The
// default, `compact: 'narrow'`, does this only on a narrow window.
export default example({
  title: 'Compact',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  pins: { compact: 'always' },
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
