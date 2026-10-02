import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Pagination, PaginationMessage, history, pageCount, range } from '../../src/state/index.js'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('paging', Pagination, { args: { perPage: 20 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.nav(
      [],
      range(1, (pageCount(model.paging) ?? 0) + 1).map(page =>
        h.button(
          [
            h.OnClick(
              Page.Message.GotPagingMessage({ message: PaginationMessage.GoToPage({ page }) }),
            ),
          ],
          [String(page)],
        ),
      ),
    ),
  subscriptions: placements.subscriptions(),
})
void config

const EditHistory = history({ name: 'EditHistory', value: Schema.String, capacity: 50 })

const Editor = Bundle.compose({}).pipe(
  Bundle.withChild('doc', EditHistory, { args: { initial: '' } }),
)
void Editor.placements
void EditHistory.Message.Push({ value: 'a', group: 'typing' })
