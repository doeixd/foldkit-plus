// @vitest-environment jsdom
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Capability, Slot, Slots, type SlotView } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Entity, Query, Remote, terminal } from 'foldkit-remote'
import { Maintained } from 'foldkit-remote/maintained'
import { Projection, Surface } from 'foldkit-surface'
import { expect, it, vi } from 'vitest'

const Row = Schema.Struct({ id: Schema.String, cents: Schema.Int })
type Row = typeof Row.Type
const Invoice = Entity.make('Invoice', Row)
const Invoices = Query.make('Invoices', { Input: {}, Result: Invoice })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Invoice], queries: [Invoices] })
const invoices = Data.query(
  Invoices,
  {},
  { select: Invoice.select({ id: true, cents: true }), first: 10 },
)
const Page = App.surface('Invoices', {
  model: () => ({
    rows: Projection.fromReader(
      Schema.Array(Row),
      (model: Model) => Maintained.value(Data, model, invoices, Maintained.list).value,
    ),
  }),
})
const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
})

const read = (rows: ReadonlyArray<Row>, now: number) =>
  Message.ReadReceived({
    requests: rows.map(({ id }) => ({ entity: 'Invoice', id, fields: ['id', 'cents'] })),
    result: {
      settled: [],
      entities: rows.map(row => ({ entity: 'Invoice', id: row.id, values: row })),
    },
    now,
  })

it('redraws only the changed row in a Surface over a maintained list', async () => {
  const fixture = [
    { id: 'first', cents: 100 },
    { id: 'second', cents: 200 },
  ]
  const model = Data.reduce(Data.reduce({ remote: Remote.initial }, read(fixture, 1)), {
    _tag: 'ConnectionMerged',
    connection: invoices.ref.identity,
    page: {
      start: terminal,
      end: terminal,
      edges: fixture.map(({ id }) => ({ key: `Invoice:${id}`, ref: { entity: 'Invoice', id } })),
    },
  })

  const drawn: string[] = []
  const draw = (
    slots: SlotView.SlotBuilders<typeof PageSlots, never>,
    h: HtmlBuilder<never>,
    { row }: { readonly row: Row },
  ) => {
    drawn.push(row.id)
    return h.li(slots.row.attrs([h.Key(row.id), h.Id(row.id)]), [String(row.cents)])
  }
  const List = SurfaceView.define(Page, PageSlots, ({ rows }, slots, h) =>
    h.ul(
      slots.root.attrs(),
      rows.map((row, index) => slots.row.lazy({ id: row.id, index }, draw, { row })),
    ),
  )

  const mount = document.createElement('div')
  mount.id = 'maintained-invoices'
  document.body.appendChild(mount)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container: mount,
      init: () => ({ model }),
      update: (model: Model, message: Message) => ({ model: Data.reduce(model, message) }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.button(
              [h.Id('edit-first'), h.OnClick(read([{ id: 'first', cents: 101 }], 2))],
              ['Edit first'],
            ),
            h.button(
              [h.Id('edit-second'), h.OnClick(read([{ id: 'second', cents: 201 }], 3))],
              ['Edit second'],
            ),
            SurfaceView.render(List, Page, undefined, model),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.getElementById('second')?.textContent).toBe('200'))
    expect(drawn).toEqual(['first', 'second'])
    for (const [id, cents] of [
      ['first', '101'],
      ['second', '201'],
    ] as const) {
      drawn.length = 0
      document.getElementById(`edit-${id}`)?.click()
      await vi.waitFor(() => expect(document.getElementById(id)?.textContent).toBe(cents))
      expect(drawn).toEqual([id])
    }
  } finally {
    handle.dispose()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  }
})
