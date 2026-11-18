import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ page: Schema.Number, perPage: Schema.Number })
const Message = defineMessageUnion({
  Went: { page: Schema.Number },
  Sized: { perPage: Schema.Number },
})

const rows = 97

// Which rows the page shows, and a choice of how many a page holds. A new
// size is the application's to apply, with the page that keeps its rows in view.
export default example({
  title: 'Rows and page size',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model,
    Message,
    init: () => ({ model: { page: 2, perPage: 10 } }),
    update: (model, message) => ({
      model: Message.match(message, {
        Went: ({ page }) => ({ ...model, page }),
        Sized: ({ perPage }) => ({
          perPage,
          page: Math.floor(((model.page - 1) * model.perPage) / perPage) + 1,
        }),
      }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    Pagination.view(
      {
        page: model.page,
        pageCount: Math.ceil(rows / model.perPage),
        onPage: page => onMessage(Message.Went({ page })),
        range: {
          total: rows,
          perPage: model.perPage,
          choose: {
            sizes: [10, 20, 50],
            onPerPage: perPage => onMessage(Message.Sized({ perPage })),
          },
        },
        style,
      },
      h,
    ),
})
