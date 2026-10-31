// @vitest-environment node
/**
 * A memoized drawing is drawn afresh while `foldkit-ssr` renders a page on
 * the server (it says so under a registered symbol): one kept from another
 * pass, or another request, would carry that render's resume markers and
 * none of this one's bindings. Under any other frame it is kept.
 */
import { Effect, Schema } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { afterEach, expect, it } from 'vitest'
import { Capability, Slot, SlotView, Slots } from '../src/index.js'

const SERVER_RENDER = Symbol.for('foldkit-plus.serverRender')

const RowSlots = Slots.define({ row: Slot.make({ capability: Capability.Container }) })
const Model = Schema.Struct({ name: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noted: {} })
type Message = typeof Message.Type

let drawn = 0
const drawRow = (_slots: unknown, h: HtmlBuilder<Message>, input: { readonly name: string }) => {
  drawn++
  return h.p([], [input.name])
}
const Row = SlotView.forMessages<Message>().define(RowSlots, (model: Model, slots) =>
  slots.row.lazy({ index: 0, id: 'only' }, drawRow, { name: model.name }),
)

const render = () =>
  Effect.runPromise(
    renderToString(
      {
        Model,
        init: () => ({ model: { name: 'acme' } }),
        update: (model: Model) => ({ model }),
        view: (model: Model, h: HtmlBuilder<Message>) => ({ title: '', body: Row(model, h) }),
        container: null,
      } as never,
      { buildId: 'b' } as never,
    ),
  )

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[SERVER_RENDER]
})

it('keeps a drawing between renders under a frame', async () => {
  await render()
  const once = drawn
  await render()
  expect(drawn).toBe(once)
})

it('draws afresh in each render while a server renders a page', async () => {
  ;(globalThis as Record<symbol, unknown>)[SERVER_RENDER] = true
  await render()
  const once = drawn
  await render()
  expect(drawn).toBe(once + 1)
})
