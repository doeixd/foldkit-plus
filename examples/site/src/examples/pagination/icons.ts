import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// An icon stands in for a stop's word. The word stays the button's accessible name.
export default example({
  title: 'Icons',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 4 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      {
        page,
        pageCount: 9,
        ends: true,
        icons: {
          first: outline(h, 'M9 3L4 8l5 5M13 3L8 8l5 5'),
          previous: outline(h, 'M10 3L5 8l5 5'),
          next: outline(h, 'M6 3l5 5-5 5'),
          last: outline(h, 'M7 3l5 5-5 5M3 3l5 5-5 5'),
        },
        onPage: page => onMessage(Message.Went({ page })),
        style,
      },
      h,
    ),
})
