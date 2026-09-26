// @vitest-environment jsdom
/**
 * An assembly's parts, on the runtime: each is drawn again only when a value
 * it reads changed, and its Behaviors see the values it was drawn from.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { Behavior, Capability, Diagnostics, Slot, SlotView, Slots, Style } from '../src/index.js'

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

it('refuses a part drawn twice in one render', () => {
  const Twice = Parts.assemble((_input, slots, h, draw) =>
    h.div(slots.root.attrs(), [draw(Title), draw(Title)]),
  )
  const codeOf = (): string | undefined => {
    try {
      Twice({ title: 'First', count: 0, other: 0 }, SlotView.inertBuilder<Message>())
      return undefined
    } catch (error) {
      return error instanceof Diagnostics.DiagnosticError ? error.diagnostic.code : String(error)
    }
  }
  expect(codeOf()).toBe('mixins:part-drawn-twice')
})
