// @vitest-environment jsdom
/**
 * A placed child's view is kept while its Model is the same object (#431), on
 * the real Foldkit runtime: a Message for one placement draws that child
 * again and leaves its sibling's drawing as it was, and `memo: false` draws
 * on every render. `Link.child` keeps its drawing the same way.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bundle, Link } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Counter = Schema.Struct({ count: Schema.Number })
type Counter = typeof Counter.Type
const CounterMessage = defineMessageUnion({ Clicked: {} })
type CounterMessage = typeof CounterMessage.Type

/** How often each child's view ran, by the name it was drawn under. */
const draws = new Map<string, number>()
const counted = (name: string) =>
  Submodel.defineView<Counter, CounterMessage>((model, h) => {
    draws.set(name, (draws.get(name) ?? 0) + 1)
    return h.button([h.Class(name), h.OnClick(CounterMessage.Clicked())], [String(model.count)])
  })
const counter = (name: string) =>
  Bundle.make({
    name: 'Counter',
    Model: Counter,
    Message: CounterMessage,
    init: () => ({ model: { count: 0 } }),
    update: (model: Counter) => ({ model: { count: model.count + 1 } }),
    view: counted(name),
  })

const GotA = Link.wrapper('GotA', CounterMessage)
const GotB = Link.wrapper('GotB', CounterMessage)
const GotC = Link.wrapper('GotC', CounterMessage)
const Model = Schema.Struct({ a: Counter, b: Counter, c: Counter })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotA.cases, ...GotB.cases, ...GotC.cases })
type Message = typeof Message.Type

const text = (selector: string) => document.querySelector(selector)?.textContent
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()

/** Frames run on a timer, as jsdom has none. */
const timedFrames = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
}

describe('A placed child', () => {
  const A = counter('a').at(Link.field<Model>()('a', GotA))
  const B = counter('b').at(Link.field<Model>()('b', GotB))
  // Drawn on every render: its view may read what its Model does not hold.
  const C = counter('c').at(Link.field<Model>()('c', GotC), { memo: false })
  const placements = Bundle.assemble<Model, Message>()([A, B, C])

  /** The three counters embedded on the runtime, drawn from nothing. */
  const mount = () => {
    draws.clear()
    const container = document.createElement('div')
    container.id = 'bundle-memo'
    document.body.appendChild(container)
    timedFrames()
    return Runtime.embed(
      Runtime.makeElement(
        placements.complete({
          Model,
          container,
          init: () => placements.init({ a: { count: 0 }, b: { count: 0 }, c: { count: 0 } }),
          update: placements.update(),
          view: (model: Model, h: HtmlBuilder<Message>) =>
            h.main([], [A.view(model, h), B.view(model, h), C.view(model, h)]),
          subscriptions: placements.subscriptions(),
          managedResources: placements.resources(),
        }),
      ),
    )
  }

  it('is drawn again exactly when its own Model changes, through two transitions', async () => {
    const handle = mount()
    try {
      await vi.waitFor(() => expect(text('.a')).toBe('0'))
      expect(Object.fromEntries(draws)).toEqual({ a: 1, b: 1, c: 1 })
      click('.a')
      await vi.waitFor(() => expect(text('.a')).toBe('1'))
      click('.a')
      await vi.waitFor(() => expect(text('.a')).toBe('2'))
      // A drew for each of its changes; B, untouched, kept its first drawing; C draws every time.
      expect(Object.fromEntries(draws)).toEqual({ a: 3, b: 1, c: 3 })
      click('.b')
      await vi.waitFor(() => expect(text('.b')).toBe('1'))
      expect(Object.fromEntries(draws)).toEqual({ a: 3, b: 2, c: 4 })
      // A kept drawing still answers its clicks.
      click('.a')
      await vi.waitFor(() => expect(text('.a')).toBe('3'))
    } finally {
      handle.dispose()
    }
  })

  it('is drawn on every render while a server renders, which keeps nothing', async () => {
    const serverRender = Symbol.for('foldkit-plus.serverRender')
    const flags = globalThis as Record<symbol, unknown>
    flags[serverRender] = true
    const handle = mount()
    try {
      await vi.waitFor(() => expect(text('.a')).toBe('0'))
      click('.a')
      await vi.waitFor(() => expect(text('.a')).toBe('1'))
      expect(Object.fromEntries(draws)).toEqual({ a: 2, b: 2, c: 2 })
    } finally {
      delete flags[serverRender]
      handle.dispose()
    }
  })
})

describe('A Link.child', () => {
  const linkA = Link.field<Model>()('a', GotA)
  const linkB = Link.field<Model>()('b', GotB)
  const update = (model: Counter) => ({ model: { count: model.count + 1 } })
  const ChildA = Link.child(linkA, update, counted('a'), 'child-a')
  const ChildB = Link.child(linkB, update, counted('b'), 'child-b', { memo: false })

  it('is kept while its Model is the same object, unless memo is false', async () => {
    draws.clear()
    const container = document.createElement('div')
    container.id = 'bundle-memo-child'
    document.body.appendChild(container)
    timedFrames()
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: { a: { count: 0 }, b: { count: 0 }, c: { count: 0 } } }),
        update: (model: Model, message: Message) =>
          Message.match(message, {
            GotA: ({ message: inner }) => ChildA.update(model, inner),
            GotB: ({ message: inner }) => ChildB.update(model, inner),
            GotC: () => ({ model }),
          }),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [ChildA.view(model, h), ChildB.view(model, h)]),
      }),
    )
    try {
      await vi.waitFor(() => expect(text('.a')).toBe('0'))
      click('.b')
      await vi.waitFor(() => expect(text('.b')).toBe('1'))
      click('.b')
      await vi.waitFor(() => expect(text('.b')).toBe('2'))
      expect(Object.fromEntries(draws)).toEqual({ a: 1, b: 3 })
      click('.a')
      await vi.waitFor(() => expect(text('.a')).toBe('1'))
      expect(Object.fromEntries(draws)).toEqual({ a: 2, b: 4 })
    } finally {
      handle.dispose()
    }
  })
})

describe('A collection item', () => {
  const Row = Schema.Struct({ id: Schema.String, count: Schema.Number })
  type Row = typeof Row.Type
  const RowMessage = defineMessageUnion({ Clicked: {} })
  const rowBundle = Bundle.make({
    name: 'Row',
    Model: Row,
    Message: RowMessage,
    init: () => ({ model: { id: '', count: 0 } }),
    update: (model: Row) => ({ model: { ...model, count: model.count + 1 } }),
    view: Submodel.defineView<Row, typeof RowMessage.Type>((model, h) => {
      draws.set(model.id, (draws.get(model.id) ?? 0) + 1)
      return h.button(
        [h.Class(`row-${model.id}`), h.OnClick(RowMessage.Clicked())],
        [`${model.count}`],
      )
    }),
  })
  const GotRow = Link.keyedWrapper('GotRow', RowMessage)
  const Rows = Schema.Struct({ rows: Schema.Record(Schema.String, Row) })
  type Rows = typeof Rows.Type
  const RowsMessage = defineMessageUnion({ Removed: { id: Schema.String }, ...GotRow.cases })
  type RowsMessage = typeof RowsMessage.Type
  const seeded = { a: { id: 'a', count: 0 }, b: { id: 'b', count: 0 }, c: { id: 'c', count: 0 } }

  it.each([
    ['is drawn again only when its own Model changes', {}, { a: 3, b: 1, c: 1 }, { a: 3, c: 2 }],
    [
      'is drawn on every render with memo: false',
      { memo: false } as const,
      { a: 3, b: 3, c: 3 },
      { a: 5, c: 5 },
    ],
  ])('%s', async (_, config, afterClicks, afterRemove) => {
    const Each = rowBundle.each(Link.collection<Rows>()('rows', GotRow), config)
    const placements = Bundle.assemble<Rows, RowsMessage>()([Each])
    draws.clear()
    const container = document.createElement('div')
    container.id = 'bundle-memo-rows'
    document.body.appendChild(container)
    timedFrames()
    const handle = Runtime.embed(
      Runtime.makeElement(
        placements.complete({
          Model: Rows,
          container,
          init: () => ({ model: { rows: seeded } }),
          update: placements.update((model, message) =>
            message._tag === 'Removed' ? Each.remove(message.id)(model) : { model },
          ),
          view: (model: Rows, h: HtmlBuilder<RowsMessage>) =>
            h.main(
              [],
              [
                h.button([h.Id('remove-b'), h.OnClick(RowsMessage.Removed({ id: 'b' }))], ['x']),
                ...Each.viewAll(model, h),
              ],
            ),
          subscriptions: placements.subscriptions(),
        }),
      ),
    )
    try {
      await vi.waitFor(() => expect(text('.row-a')).toBe('0'))
      click('.row-a')
      await vi.waitFor(() => expect(text('.row-a')).toBe('1'))
      click('.row-a')
      await vi.waitFor(() => expect(text('.row-a')).toBe('2'))
      expect(Object.fromEntries(draws)).toEqual(afterClicks)
      click('#remove-b')
      await vi.waitFor(() => expect(document.querySelector('.row-b')).toBeNull())
      click('.row-c')
      await vi.waitFor(() => expect(text('.row-c')).toBe('1'))
      const { b: _, ...rest } = Object.fromEntries(draws)
      expect(rest).toEqual(afterRemove)
    } finally {
      handle.dispose()
    }
  })
})

describe('A collection', () => {
  const Row = Schema.Struct({ n: Schema.Number })
  const Rows = Schema.Struct({ rows: Schema.Record(Schema.String, Row) })
  type Rows = typeof Rows.Type
  const Item = Bundle.make({
    name: 'Item',
    Model: Row,
    Message: CounterMessage,
    init: () => ({ model: { n: 0 } }),
    update: model => ({ model }),
    view: Submodel.defineView<typeof Row.Type, CounterMessage>((model, h) =>
      h.span([h.Class('item')], [String(model.n)]),
    ),
  })
  const GotItem = Link.keyedWrapper('GotItem', CounterMessage)
  const RowsMessage = defineMessageUnion({ ...GotItem.cases })

  // The count of `entries` calls is exact where a clock is not: one list per
  // draw, not one per item (#520).
  it('lists its entries once per draw, however many items it draws for the first time', async () => {
    const size = 400
    const link = Link.collection<Rows>()('rows', GotItem)
    let listed = 0
    const counting = {
      ...link,
      entries: (parent: Rows) => {
        listed++
        return link.entries(parent)
      },
    }
    const Placed = Item.each(counting as typeof link)
    const placements = Bundle.assemble<Rows, typeof RowsMessage.Type>()([Placed])
    const container = document.createElement('div')
    container.id = 'bundle-collection-first-draw'
    document.body.appendChild(container)
    timedFrames()
    const rows = Object.fromEntries(Array.from({ length: size }, (_, i) => [`r${i}`, { n: i }]))
    const handle = Runtime.embed(
      Runtime.makeElement(
        placements.complete({
          Model: Rows,
          container,
          init: () => placements.init({ rows }),
          update: placements.update(),
          view: (model: Rows, h: HtmlBuilder<typeof RowsMessage.Type>) =>
            h.main([], Placed.viewAll(model, h)),
          subscriptions: placements.subscriptions(),
        }),
      ),
    )
    try {
      await vi.waitFor(() => expect(document.querySelectorAll('.item')).toHaveLength(size))
      expect(listed).toBeLessThanOrEqual(3)
    } finally {
      handle.dispose()
    }
  })
})
