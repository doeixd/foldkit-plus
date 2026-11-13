/** The draft application's view. The bridge never reads it. */
import type { HtmlBuilder } from 'foldkit/html'
import { type Message, Message as MessageUnion, type Model } from './draftApp.js'

export const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [h.Id('draft-app')],
    [
      h.input([
        h.Id('search-first'),
        h.AriaLabel('Search'),
        h.Type('search'),
        h.Value(model.query),
        h.OnInput(value => MessageUnion.Typed({ value })),
      ]),
      h.input([
        h.Id('search-second'),
        h.AriaLabel('Search'),
        h.Type('search'),
        h.Value(model.query),
        h.OnInput(value => MessageUnion.Typed({ value })),
      ]),
      h.button(
        [
          h.Id('clear-search'),
          h.Type('button'),
          h.AriaLabel('Clear search'),
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
          h.AriaLabel('Save'),
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
