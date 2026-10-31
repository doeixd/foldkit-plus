// @vitest-environment jsdom
/**
 * A region on the runtime: drawn again exactly when a Model path it reads
 * changed, each time and not only the first, and a Slot's per-item memo
 * forgetting the keys it no longer draws.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, expect, it, vi } from 'vitest'
import { Capability, Slot, SlotView, Slots, Style } from '../src/index.js'

const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  region: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
})

const Model = Schema.Struct({
  pair: Schema.Struct({ a: Schema.Number, b: Schema.Number }),
  c: Schema.Number,
  rows: Schema.Array(Schema.String),
  // Moved by every Message, and drawn outside every region: the page has drawn a step.
  step: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  BumpedA: {},
  BumpedB: {},
  BumpedC: {},
  Showed: { rows: Schema.Array(Schema.String) },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
type H = HtmlBuilder<Message>
type Builders = SlotView.SlotBuilders<typeof PageSlots, Message>

const drawn: Array<string> = []

// Two paths, one below a field, through the application's references.
const Sums = SlotView.region(
  Projection.struct({ a: App.model.pair.a, c: App.model.c }),
  ({ a, c }, slots: Builders, h: H) => {
    drawn.push('Sums')
    return h.p(slots.region.attrs([h.Id('sums')]), [`${a}+${c}`])
  },
)
// A value derived from a path: `c` moving from one odd number to the next reads the same.
const Parity = SlotView.region(
  Projection.fromReader(
    Schema.Struct({ odd: Schema.Boolean }),
    (model: Model) => ({ odd: model.c % 2 === 1 }),
    { dependencies: [['c']] },
  ),
  ({ odd }, slots: Builders, h: H) => {
    drawn.push('Parity')
    return h.p(slots.region.attrs([h.Id('parity')]), [odd ? 'odd' : 'even'])
  },
)
const drawRow = (slots: Builders, h: H, { text }: { readonly text: string }) => {
  drawn.push(text)
  return h.li(slots.row.attrs([h.Key(text)], { index: 0, id: text }), [text])
}

const button = (h: H, id: string, message: Message) =>
  h.button([h.Id(id), h.OnClick(message)], [id])

const Page = SlotView.forMessages<Message>().define(PageSlots, (model: Model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.span([h.Id('step')], [String(model.step)]),
    button(h, 'a', Message.BumpedA()),
    button(h, 'b', Message.BumpedB()),
    button(h, 'c', Message.BumpedC()),
    button(h, 'ab', Message.Showed({ rows: ['a', 'b'] })),
    button(h, 'cd', Message.Showed({ rows: ['c', 'd'] })),
    Sums(model, slots, h),
    Parity(model, slots, h),
    h.ul(
      [],
      model.rows.map((text, index) => slots.row.lazy({ index, id: text }, drawRow, { text })),
    ),
  ]),
)

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const run = async (view: (model: Model, h: H) => ReturnType<typeof Page>) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'page'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { pair: { a: 0, b: 0 }, c: 1, rows: ['a', 'b'], step: 0 } }),
      update: (model: Model, message: Message) => {
        const next = Message.match(message, {
          BumpedA: () => ({ ...model, pair: { ...model.pair, a: model.pair.a + 1 } }),
          BumpedB: () => ({ ...model, pair: { ...model.pair, b: model.pair.b + 1 } }),
          BumpedC: () => ({ ...model, c: model.c + 2 }),
          Showed: ({ rows }) => ({ ...model, rows }),
        })
        return { model: { ...next, step: model.step + 1 } }
      },
      view,
    }),
  )
  const text = (selector: string) => document.querySelector(selector)?.textContent
  await vi.waitFor(() => expect(text('#sums')).toBe('0+1'))
  let steps = 0
  /** Presses a button and waits for the frame that drew its Message; returns what was drawn. */
  const press = async (id: string): Promise<ReadonlyArray<string>> => {
    drawn.length = 0
    steps++
    document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(text('#step')).toBe(String(steps)))
    return [...drawn]
  }
  return { handle, text, press }
}

it('draws a region again exactly when a path it reads changed, each time', async () => {
  const { handle, text, press } = await run((model, h) => Page(model, h))
  try {
    // A path below a field, twice, so the second is not the miss after a first draw.
    expect(await press('a')).toEqual(['Sums'])
    expect(text('#sums')).toBe('1+1')
    expect(await press('a')).toEqual(['Sums'])
    expect(text('#sums')).toBe('2+1')
    // A field beside the one read, inside the same parent, twice.
    expect(await press('b')).toEqual([])
    expect(await press('b')).toEqual([])
    // A second path, twice: `Parity` reads it too, but reads the same parity.
    expect(await press('c')).toEqual(['Sums'])
    expect(text('#sums')).toBe('2+3')
    expect(await press('c')).toEqual(['Sums'])
    expect(text('#sums')).toBe('2+5')
    expect(text('#parity')).toBe('odd')
  } finally {
    handle.dispose()
  }
})

it('draws every region again while a Mixin reads the whole input', async () => {
  const Marked = Page.pipe(
    Style.attach(
      Style.forSlots(PageSlots)({
        region: Style.whenInput<Model>(model => model.pair.b > 0, Style.class('marked')),
      }),
    ),
  )
  const { handle, press } = await run((model, h) => Marked(model, h))
  try {
    expect(await press('b')).toEqual(['Sums', 'Parity'])
    expect(document.querySelector('#sums')?.classList.contains('marked')).toBe(true)
  } finally {
    handle.dispose()
  }
})

it('refuses a region that reads no Model path', () => {
  expect(() =>
    SlotView.region(
      Projection.fromReader(Schema.Number, (model: Model) => model.c),
      (c, slots: Builders, h: H) => h.p(slots.region.attrs(), [String(c)]),
    ),
  ).toThrow(/no Model paths/)
})

it('keeps the items of two lists that share a drawing and some keys', async () => {
  // A second list keyed by position, as the first, but shorter: each pass
  // draws keys 0 and 1 twice, and 2 once.
  const byIndex = (slots: Builders, h: H, { text }: { readonly text: string }) => {
    drawn.push(text)
    return h.li(slots.row.attrs(), [text])
  }
  const Twice = SlotView.forMessages<Message>().define(PageSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.span([h.Id('step')], [String(model.step)]),
      button(h, 'b', Message.BumpedB()),
      h.p([h.Id('sums')], [`${model.pair.a}+${model.c}`]),
      h.ul(
        [],
        ['x', 'y', 'z'].map((text, index) => slots.row.lazy({ index }, byIndex, { text })),
      ),
      h.ol(
        [],
        ['x', 'y'].map((text, index) => slots.row.lazy({ index }, byIndex, { text })),
      ),
    ]),
  )
  const { handle, press } = await run((model, h) => Twice(model, h))
  try {
    for (const id of ['b', 'b', 'b', 'b']) expect(await press(id)).toEqual([])
  } finally {
    handle.dispose()
  }
})

it('forgets the items it no longer draws, and keeps those it does', async () => {
  const { handle, press } = await run((model, h) => Page(model, h))
  try {
    // Drawn in view on every pass, never drawn again.
    for (const id of ['b', 'b', 'b']) expect(await press(id)).toEqual([])
    expect(await press('cd')).toEqual(['c', 'd'])
    for (const id of ['b', 'b', 'b']) expect(await press(id)).toEqual([])
    // `a` and `b` left two passes ago and more: forgotten, so drawn afresh.
    expect(await press('ab')).toEqual(['a', 'b'])
  } finally {
    handle.dispose()
  }
})
