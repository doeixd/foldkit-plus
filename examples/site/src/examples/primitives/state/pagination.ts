import { Pagination, PaginationMessage, offset, pageCount } from 'foldkit-primitives/state'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// The bundle owns the page and the steps between pages; the rows are the application's.
export default primitiveExample({
  title: 'Pagination',
  text: '`Pagination` holds the page, the page size and the total, and clamps every step into range. `offset` and `pageCount` read it.',
  state: Pagination.with({ perPage: 10, total: 95 }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.Disabled(model.page === 1),
            h.OnClick(onMessage(PaginationMessage.PrevPage())),
          ]),
          ['Previous'],
        ),
        ` Rows ${offset(model) + 1} to ${Math.min(offset(model) + model.perPage, model.total ?? 0)}, page ${model.page} of ${pageCount(model)} `,
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.Disabled(model.page === pageCount(model)),
            h.OnClick(onMessage(PaginationMessage.NextPage())),
          ]),
          ['Next'],
        ),
      ],
    ),
})
