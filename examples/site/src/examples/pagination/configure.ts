import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// The look, windows and words every pager of the application starts from,
// and a named preset over them. The page and `onPage` stay each use's.
const Pills = forSlots(PaginationSlots)(Recipes.Pagination({ shape: 'round' }))

const AppPagination = Pagination.configure({
  base: { style: Pills, siblings: 2, words: { previous: 'Back' } },
  presets: { feed: { numbered: false, words: { next: 'Older' } } },
})

export default example({
  title: 'Configure once',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 5 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ model: page, onMessage, h }) =>
    AppPagination.view(
      { page, pageCount: 30, preset: 'feed', onPage: page => onMessage(Message.Went({ page })) },
      h,
    ),
})
