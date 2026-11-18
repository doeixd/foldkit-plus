import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// With one page there are no stops to draw: the control draws nothing, unless
// a `range` has a summary to say, as here.
export default example({
  title: 'One page',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 1 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      {
        page,
        pageCount: 1,
        onPage: page => onMessage(Message.Went({ page })),
        range: { total: 7, perPage: 10 },
        style,
      },
      h,
    ),
})
