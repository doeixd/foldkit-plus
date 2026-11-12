/**
 * `Cms.historyCard` rendered to server markup, for `history.test.ts`, which
 * loads it in child processes through `historyChild.mjs`.
 */
import { Effect, Option, Schema } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Cms } from '../src/index.js'

const Message = defineMessageUnion({ RestoreAsked: { revision: Schema.Number } })
type Message = typeof Message.Type

const container = Slot.make({ capability: Capability.Container })
const HistorySlots = Slots.define({
  card: container,
  cardTitle: container,
  muted: container,
  timeline: container,
  revision: container,
  revisionMark: container,
  revisionBody: container,
  revisionTitle: container,
  revisionLive: container,
  revisionMeta: container,
  revisionRestore: Slot.make({ capability: Capability.Interactive }),
})

const History = SlotView.define(HistorySlots, (_model: {}, slots, h: HtmlBuilder<Message>) =>
  Cms.historyCard(
    slots,
    h,
    {
      _tag: 'Ready',
      // Late in a UTC day: the date moves east of UTC, the hour everywhere else.
      revisions: [{ n: 1, publishedAt: '2026-09-27T23:30:00.000Z', publishedBy: null }],
    },
    {
      state: Option.some({ _tag: 'Published', schedule: null }),
      restore: revision => Message.RestoreAsked({ revision }),
      authorName: name => name,
      locale: 'en',
      timeZone: 'UTC',
    },
  ),
)

export const render = () =>
  Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (model: {}, h: HtmlBuilder<Message>) => ({
          title: 'History',
          body: History(model, h),
        }),
      },
      { buildId: 'history' },
    ),
  ).then(rendered => rendered.html)
