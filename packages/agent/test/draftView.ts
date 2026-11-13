/**
 * The draft application's view. The bridge never reads it; the view reads the
 * part catalog, so a control's accessible name is the label an agent hears.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { type Message, Message as MessageUnion, type Model, partCatalog } from './draftApp.js'

const search = partCatalog.part('search').label

export const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [h.Id('draft-app')],
    [
      h.input([
        h.Id('search-first'),
        h.AriaLabel(search),
        h.Type('search'),
        h.Value(model.query),
        h.OnInput(value => MessageUnion.Typed({ value })),
      ]),
      h.input([
        h.Id('search-second'),
        h.AriaLabel(search),
        h.Type('search'),
        h.Value(model.query),
        h.OnInput(value => MessageUnion.Typed({ value })),
      ]),
      h.button(
        [
          h.Id('clear-search'),
          h.Type('button'),
          h.AriaLabel(partCatalog.part('search.clear').label),
          h.OnClick(MessageUnion.Cleared()),
        ],
        ['Clear'],
      ),
      h.input([
        h.Id('draft'),
        h.AriaLabel('Draft'),
        h.Value(model.draft),
        h.OnInput(value => MessageUnion.DraftChanged({ value })),
      ]),
      h.button(
        [
          h.Id('save'),
          h.Type('button'),
          h.AriaLabel(partCatalog.part('draft.save').label),
          h.OnClick(MessageUnion.RequestedSave({ requestId: 'user-1', title: model.draft })),
        ],
        ['Save'],
      ),
      h.button(
        [
          h.Id('toggle'),
          h.Type('button'),
          h.AriaLabel('Toggle'),
          h.OnClick(MessageUnion.Toggled()),
        ],
        ['Toggle'],
      ),
    ],
  )
