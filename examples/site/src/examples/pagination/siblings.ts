import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// Two stops either side of the current page, and two at each end.
export default example({
  title: 'Siblings and boundaries',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 20 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      {
        page,
        pageCount: 40,
        siblings: 2,
        boundaries: 2,
        onPage: page => onMessage(Message.Went({ page })),
        style,
      },
      h,
    ),
})
