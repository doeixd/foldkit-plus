import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Pagination, PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Message = defineMessageUnion({ Went: { page: Schema.Number } })

// Every stop's words, and the name each is given, in your language: text
// with `{blanks}`, merged over `Pagination.words` key by key.
export default example({
  title: 'Words of your own',
  slots: PaginationSlots,
  recipe: Recipes.Pagination,
  state: {
    Model: Schema.Number,
    Message,
    init: () => ({ model: 3 }),
    update: (_, message) => ({ model: message.page }),
  },
  view: ({ style, model: page, onMessage, h }) =>
    Pagination.view(
      {
        page,
        pageCount: 8,
        ends: true,
        words: {
          label: 'Seitennavigation',
          first: 'Erste',
          previous: 'Zurück',
          next: 'Weiter',
          last: 'Letzte',
          stop: '{word} Seite',
        },
        onPage: page => onMessage(Message.Went({ page })),
        style,
      },
      h,
    ),
})
