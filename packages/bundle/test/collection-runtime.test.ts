// @vitest-environment jsdom
/**
 * A collection on the real Foldkit runtime: adding an item starts its
 * Subscription, removing it stops it, and clicks route by key.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import { afterEach, expect, it, vi } from 'vitest'
import { Bundle, Link } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const RowModel = Schema.Struct({ id: Schema.String, count: Schema.Number })
type RowModel = typeof RowModel.Type
const RowMessage = defineMessageUnion({ Clicked: {}, Ticked: {} })
type RowMessage = typeof RowMessage.Type

// One buffered tick queue per row id: a tick waits until that row's stream reads it.
const queues = new Map<string, Queue.Queue<void>>()
const queueFor = (id: string) => {
  const queue = queues.get(id) ?? Effect.runSync(Queue.unbounded<void>())
  queues.set(id, queue)
  return queue
}
const running = new Set<string>()

const Row = Bundle.make({
  name: 'Row',
  Model: RowModel,
  Message: RowMessage,
  init: () => ({ model: { id: '', count: 0 } }),
  update: model => ({ model: { ...model, count: model.count + 1 } }),
  subscriptions: () =>
    Subscription.make<RowModel, RowMessage>()(entry => ({
      ticks: entry(
        { id: Schema.String },
        {
          modelToDependencies: model => ({ id: model.id }),
          dependenciesToStream: ({ id }) =>
            Stream.fromQueue(queueFor(id)).pipe(
              Stream.map(() => RowMessage.Ticked()),
              Stream.onStart(Effect.sync(() => void running.add(id))),
              Stream.ensuring(Effect.sync(() => void running.delete(id))),
            ),
        },
      ),
    })),
  view: Submodel.defineView<RowModel, RowMessage>((model, h) =>
    h.button([h.Class('row'), h.OnClick(RowMessage.Clicked())], [`${model.id}:${model.count}`]),
  ),
})

const GotRowMessage = Link.keyedWrapper('GotRowMessage', RowMessage)
const Model = Schema.Struct({ rows: Schema.Record(Schema.String, RowModel) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClickedAdd: { id: Schema.String },
  ClickedRemove: { id: Schema.String },
  ...GotRowMessage.cases,
})
type Message = typeof Message.Type

const Rows = Row.each(Link.collection<Model>()('rows', GotRowMessage))
const placements = Bundle.assemble<Model, Message>()([Rows])

const update = (model: Model, message: Message) =>
  Option.getOrElse(placements.update(model, message), () => {
    switch (message._tag) {
      case 'ClickedAdd':
        return Rows.add(message.id, row => ({ ...row, id: message.id }))(model)
      case 'ClickedRemove':
        return Rows.remove(message.id)(model)
      default:
        return { model }
    }
  })

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      h.button([h.Id('add-b'), h.OnClick(Message.ClickedAdd({ id: 'b' }))], ['add b']),
      h.button([h.Id('remove-a'), h.OnClick(Message.ClickedRemove({ id: 'a' }))], ['remove a']),
      h.ul(
        [],
        Rows.viewAll(model, h).map(row => h.li([], [row])),
      ),
    ],
  )

const rows = () => Array.from(document.querySelectorAll('.row'), row => row.textContent)
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()
const publish = (id: string) => Effect.runSync(Queue.offer(queueFor(id), undefined))

it('starts and stops item Subscriptions as items are added and removed', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'collection-runtime'
  document.body.appendChild(container)

  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        // Row a starts with the application, so its stream running proves the fibers are attached.
        init: () => Rows.add('a', row => ({ ...row, id: 'a' }))({ rows: {} }),
        update,
        view,
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(running).toEqual(new Set(['a'])))
    publish('a')
    await vi.waitFor(() => expect(rows()).toEqual(['a:1']))

    click('#add-b')
    await vi.waitFor(() => expect(running).toEqual(new Set(['a', 'b'])))
    publish('b')
    await vi.waitFor(() => expect(rows()).toEqual(['a:1', 'b:1']))

    click('.row')
    await vi.waitFor(() => expect(rows()).toEqual(['a:2', 'b:1']))

    click('#remove-a')
    await vi.waitFor(() => expect(running).toEqual(new Set(['b'])))
    expect(rows()).toEqual(['b:1'])
    publish('b')
    await vi.waitFor(() => expect(rows()).toEqual(['b:2']))
  } finally {
    handle.dispose()
  }
})
