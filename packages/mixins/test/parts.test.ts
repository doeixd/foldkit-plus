// @vitest-environment jsdom
/**
 * An assembly's parts, on the runtime: each is drawn again only when a value
 * it reads changed, and its Behaviors see the values it was drawn from.
 */
import { Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { Behavior, Capability, Slot, SlotView, Slots, Style } from '../src/index.js'

const PanelSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  count: Slot.make({ capability: Capability.Container }),
})

const Model = Schema.Struct({ title: Schema.String, count: Schema.Number, other: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Retitled: {}, Counted: {}, Elsewhere: {} })
type Message = typeof Message.Type

// Which parts ran, in order.
const drawn: Array<string> = []
const Parts = SlotView.parts(PanelSlots)<Model, Message>()
const Title = Parts.part('Title', { reads: ['title'] }, (input, slots, h) => {
  drawn.push('Title')
  return h.h2(slots.title.attrs(), [input.title])
})
const Count = Parts.part(
  'Count',
  {
    reads: ['count'],
    behaviors: [
      Behavior.forSlots(PanelSlots)<Pick<Model, 'count'>, Message>({
        count: Behavior.slot({
          attributes: ({ input, h }) => [h.DataAttribute('seen', String(input.count))],
        }),
      }),
    ],
  },
  (input, slots, h) => {
    drawn.push('Count')
    return h.p(slots.count.attrs([h.Id('count')]), [String(input.count)])
  },
)
const Panel = Parts.assemble((input, slots, h, draw) =>
  h.div(slots.root.attrs(), [
    h.button([h.Id('retitle'), h.OnClick(Message.Retitled())], ['Retitle']),
    h.button([h.Id('counted'), h.OnClick(Message.Counted())], ['Count']),
    h.button([h.Id('elsewhere'), h.OnClick(Message.Elsewhere())], [String(input.other)]),
    draw(Title),
    draw(Count),
  ]),
)

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Runs `view` over a fresh Model; `press` clicks a button and waits for the page to settle. */
const run = async (view: (model: Model, h: HtmlBuilder<Message>) => ReturnType<typeof Panel>) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'panel'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { title: 'First', count: 0, other: 0 } }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Retitled':
            return { model: { ...model, title: `${model.title}!` } }
          case 'Counted':
            return { model: { ...model, count: model.count + 1 } }
          case 'Elsewhere':
            return { model: { ...model, other: model.other + 1 } }
        }
      },
      view,
    }),
  )
  // The runtime draws in place of the container, so the page is read from the document.
  const find = (selector: string) => document.querySelector(selector)
  await vi.waitFor(() => expect(find('h2')?.textContent).toBe('First'))
  drawn.length = 0
  const press = async (button: string, settled: () => void) => {
    drawn.length = 0
    find(`#${button}`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(settled)
  }
  return { handle, find, press }
}

it('draws a part again only when a value it reads changed', async () => {
  const { handle, find, press } = await run((model, h) => Panel(model, h))
  try {
    await press('elsewhere', () => expect(find('#elsewhere')?.textContent).toBe('1'))
    expect(drawn).toEqual([])

    await press('counted', () => expect(find('#count')?.textContent).toBe('1'))
    expect(drawn).toEqual(['Count'])
    // The part's Behavior was resolved against the new value, not a cached one.
    expect(find('#count')?.getAttribute('data-seen')).toBe('1')

    await press('retitle', () => expect(find('h2')?.textContent).toBe('First!'))
    expect(drawn).toEqual(['Title'])
  } finally {
    handle.dispose()
  }
})

it('draws every part again when a Mixin attached to the whole view reads the input', async () => {
  const Marked = Panel.pipe(
    Style.attach(
      Style.forSlots(PanelSlots)({
        title: Style.whenInput<Model>(model => model.other > 0, Style.class('elsewhere')),
      }),
    ),
  )
  const { handle, find, press } = await run((model, h) => Marked(model, h))
  try {
    await press('elsewhere', () => expect(find('#elsewhere')?.textContent).toBe('1'))
    expect(drawn).toEqual(['Title', 'Count'])
    expect(find('h2')?.classList.contains('elsewhere')).toBe(true)
  } finally {
    handle.dispose()
  }
})

// Throws once there is a count, from a part itself or from an item it draws.
const fragile = (
  slots: SlotView.SlotBuilders<typeof PanelSlots, Message>,
  h: HtmlBuilder<Message>,
  count: number,
) => {
  drawn.push('Fragile')
  if (count > 0) throw new Error('Fragile cannot count')
  return h.p(slots.count.attrs(), [String(count)])
}
const FragilePart = Parts.part('Fragile', { reads: ['count'] }, (input, slots, h) =>
  fragile(slots, h, input.count),
)
const FragileItem = Parts.part('FragileItem', { reads: ['count'] }, (input, slots) =>
  slots.count.lazy({ index: 0 }, fragile, [input.count]),
)

it.each([
  ['a part', FragilePart],
  ['an item', FragileItem],
])('lets an error from %s through as it is, drawn once', async (_, part) => {
  const Broken = Parts.assemble((_input, slots, h, draw) =>
    h.div(slots.root.attrs(), [
      h.button([h.Id('counted'), h.OnClick(Message.Counted())], ['Count']),
      draw(Title),
      draw(part),
    ]),
  )
  const { handle, press } = await run((model, h) => Broken(model, h))
  try {
    await press('counted', () => expect(drawn).toContain('Fragile'))
    // Not caught and drawn again as if there were no runtime to memoize under.
    expect(drawn).toEqual(['Fragile'])
  } finally {
    handle.dispose()
  }
})

it('draws a part placed twice in both places, however often it is reused', async () => {
  const Twice = Parts.assemble((input, slots, h, draw) =>
    h.div(slots.root.attrs(), [
      h.button([h.Id('retitle'), h.OnClick(Message.Retitled())], ['Retitle']),
      h.button([h.Id('elsewhere'), h.OnClick(Message.Elsewhere())], [String(input.other)]),
      draw(Title),
      draw(Title),
    ]),
  )
  const { handle, find, press } = await run((model, h) => Twice(model, h))
  const titles = () => Array.from(document.querySelectorAll('h2'), title => title.textContent)
  try {
    expect(titles()).toEqual(['First', 'First'])
    await press('retitle', () => expect(titles()).toEqual(['First!', 'First!']))
    // Reused, not drawn: both places still show it.
    await press('elsewhere', () => expect(find('#elsewhere')?.textContent).toBe('1'))
    expect(drawn).toEqual([])
    expect(titles()).toEqual(['First!', 'First!'])
    await press('retitle', () => expect(titles()).toEqual(['First!!', 'First!!']))
  } finally {
    handle.dispose()
  }
})

// Rows under one part: each a per-item drawing, with a roving tab stop a
// Behavior works out from the whole list.
const ListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const ListModel = Schema.Struct({
  rows: Schema.Array(Schema.String),
  current: Schema.Number,
  other: Schema.Number,
  stamp: Schema.Number,
})
type ListModel = typeof ListModel.Type
const ListMessage = defineMessageUnion({ Moved: {}, Renamed: {}, Elsewhere: {}, Stamped: {} })
type ListMessage = typeof ListMessage.Type

const rowsDrawn: Array<string> = []
const Roving = Behavior.forSlots(ListSlots)<Pick<ListModel, 'current'>, ListMessage>({
  row: Behavior.slot({
    attributes: ({ input, h, item }) => [h.Tabindex(item?.index === input.current ? 0 : -1)],
  }),
})
const drawRow = (
  slots: SlotView.SlotBuilders<typeof ListSlots, ListMessage>,
  h: HtmlBuilder<ListMessage>,
  index: number,
  text: string,
) => {
  rowsDrawn.push(text)
  return h.li(slots.row.attrs([h.Key(String(index))], { index }), [text])
}
const ListParts = SlotView.parts(ListSlots)<ListModel, ListMessage>()
const Rows = ListParts.part(
  'Rows',
  { reads: ['rows', 'current'], behaviors: [Roving] },
  (input, slots, h) =>
    h.ul(
      slots.root.attrs(),
      // Keyed by position: a renamed row keeps its key, and only its text changed.
      input.rows.map((text, index) => slots.row.lazy({ index }, drawRow, [index, text])),
    ),
)
// The same rows inside one group, itself drawn per item: the group holds rows
// whose tab stop it cannot see, so it is drawn every time the part is.
const drawGroupedRow = (
  slots: SlotView.SlotBuilders<typeof ListSlots, ListMessage>,
  h: HtmlBuilder<ListMessage>,
  index: number,
  text: string,
) => h.li(slots.row.attrs([h.Key(text)], { index, id: text }), [text])
const drawGroup = (
  slots: SlotView.SlotBuilders<typeof ListSlots, ListMessage>,
  h: HtmlBuilder<ListMessage>,
  rows: ReadonlyArray<string>,
) =>
  h.ol(
    slots.group.attrs([h.Id('grouped')], { index: 9, id: 'group' }),
    rows.map((text, index) => slots.row.lazy({ index, id: text }, drawGroupedRow, [index, text])),
  )
const Grouped = ListParts.part(
  'Grouped',
  { reads: ['rows', 'current'], behaviors: [Roving] },
  // Index 9, which no tab stop reaches, so only the rows inside could tell a move.
  (input, slots) => slots.group.lazy({ index: 9, id: 'group' }, drawGroup, [input.rows]),
)
// A mount made with one function and a Date in its args: a Date's time is not
// an own key, so only comparing it by identity tells two stamps apart.
const stampedDrawn: Array<string> = []
const watch: MountAction<ListMessage>['f'] = () => Stream.empty
const Stamp = Behavior.forSlots(ListSlots)<Pick<ListModel, 'stamp'>, ListMessage>({
  row: Behavior.slot({
    mount: input => ({ name: 'Stamp', args: { at: new Date(input.stamp) }, f: watch }),
  }),
})
const drawStamped = (
  slots: SlotView.SlotBuilders<typeof ListSlots, ListMessage>,
  h: HtmlBuilder<ListMessage>,
  index: number,
  text: string,
) => {
  stampedDrawn.push(text)
  return h.li(slots.row.attrs([h.Key(text)], { index, id: text }), [text])
}
const StampedRows = ListParts.part(
  'Stamped',
  { reads: ['rows', 'stamp'], behaviors: [Stamp] },
  (input, slots, h) =>
    h.ol(
      slots.root.attrs(),
      input.rows.map((text, index) =>
        slots.row.lazy({ index, id: text }, drawStamped, [index, text]),
      ),
    ),
)
const List = ListParts.assemble((input, _slots, h, draw) =>
  h.div(
    [],
    [
      h.button([h.Id('moved'), h.OnClick(ListMessage.Moved())], ['Move']),
      h.button([h.Id('renamed'), h.OnClick(ListMessage.Renamed())], ['Rename']),
      h.button([h.Id('elsewhere'), h.OnClick(ListMessage.Elsewhere())], [String(input.other)]),
      h.button([h.Id('stamped'), h.OnClick(ListMessage.Stamped())], [String(input.stamp)]),
      draw(Rows),
      draw(Grouped),
      draw(StampedRows),
    ],
  ),
)

it('draws a row again only when its values or what a Behavior gave it changed', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'list'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: ListModel,
      container,
      init: () => ({ model: { rows: ['a', 'b', 'c', 'd'], current: 0, other: 0, stamp: 0 } }),
      update: (model: ListModel, message: ListMessage) => {
        switch (message._tag) {
          case 'Moved':
            return { model: { ...model, current: model.current + 1 } }
          case 'Renamed':
            return { model: { ...model, rows: model.rows.map(row => (row === 'd' ? 'e' : row)) } }
          case 'Elsewhere':
            return { model: { ...model, other: model.other + 1 } }
          case 'Stamped':
            return { model: { ...model, stamp: model.stamp + 1 } }
        }
      },
      view: (model: ListModel, h: HtmlBuilder<ListMessage>) => List(model, h),
    }),
  )
  const find = (selector: string) => document.querySelector(selector)
  const stops = (list = 'ul') =>
    Array.from(document.querySelectorAll(`${list} li`), row => row.getAttribute('tabindex'))
  const press = async (button: string, settled: () => void) => {
    rowsDrawn.length = 0
    find(`#${button}`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(settled)
  }
  try {
    await vi.waitFor(() => expect(stops()).toEqual(['0', '-1', '-1', '-1']))

    // The part is drawn again (it reads `current`), but only the two rows
    // whose tab stop moved are.
    await press('moved', () => expect(stops()).toEqual(['-1', '0', '-1', '-1']))
    expect(rowsDrawn).toEqual(['a', 'b'])
    expect(stops('#grouped')).toEqual(['-1', '0', '-1', '-1'])
    // Again, now that each drawing's Slots are known from its last draw.
    await press('moved', () => expect(stops()).toEqual(['-1', '-1', '0', '-1']))
    expect(rowsDrawn).toEqual(['b', 'c'])
    expect(stops('#grouped')).toEqual(['-1', '-1', '0', '-1'])

    // A row whose own value changed, alone.
    await press('renamed', () => expect(find('ul li:last-child')?.textContent).toBe('e'))
    expect(rowsDrawn).toEqual(['e'])

    await press('elsewhere', () => expect(find('#elsewhere')?.textContent).toBe('1'))
    expect(rowsDrawn).toEqual([])

    // Twice, so the second is not the miss that follows the first draw.
    for (const stamp of ['1', '2']) {
      stampedDrawn.length = 0
      await press('stamped', () => expect(find('#stamped')?.textContent).toBe(stamp))
      expect(stampedDrawn).toEqual(['a', 'b', 'c', 'e'])
    }
  } finally {
    handle.dispose()
  }
})
