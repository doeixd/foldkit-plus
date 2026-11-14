/**
 * `Lasso` in a real browser, drawn with the real mouse through the DevTools
 * protocol: which items a rectangle touches, what starts one, Shift, Escape,
 * a scroll under a held pointer, two surfaces; and a page that hands the ids
 * to `Selection` and announces the count through `LiveAnnounce`.
 */
import { Effect, Fiber, Match, Option, Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { liveViewStateChanges } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import {
  Lasso,
  LassoCancelled,
  LassoEnded,
  LassoMoved,
  LassoRect,
  LassoStarted,
  type LassoFact,
} from '../src/dom/lasso.js'
import { Lasso as LassoBehavior, LiveAnnounce, Selection } from '../src/interaction/index.js'

let stops: Array<() => Promise<unknown>> = []
afterEach(async () => {
  // Let go of the mouse, wherever a failed test left it.
  await cdp().send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 1,
    y: 1,
    button: 'left',
  })
  for (const stop of stops) await stop()
  stops = []
  dispose()
  document.body.replaceChildren()
})

/** A surface with items placed at `[id, left, top]`, 40 by 40, and a button. */
const surface = (items: ReadonlyArray<readonly [string, number, number]>, height = 300) => {
  const element = document.createElement('div')
  element.style.cssText = `position: relative; width: 400px; height: ${height}px; overflow: auto; background: #eee`
  for (const [id, left, top] of items) {
    const item = document.createElement('div')
    item.setAttribute('data-item', id)
    item.style.cssText = `position: absolute; left: ${left}px; top: ${top}px; width: 40px; height: 40px; background: #99c`
    element.append(item)
  }
  const button = document.createElement('button')
  button.textContent = 'Add'
  button.style.cssText = 'position: absolute; left: 300px; top: 250px'
  element.append(button)
  // Content below the fold, to scroll to.
  const tall = document.createElement('div')
  tall.style.cssText = 'position: absolute; left: 0; top: 0; width: 1px; height: 900px'
  element.append(tall)
  document.body.append(element)
  return element
}

const watch = async (element: HTMLElement) => {
  const facts: Array<LassoFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(Lasso({ attribute: 'data-item' }).f(element, liveViewStateChanges), fact =>
      Effect.sync(() => facts.push(fact)),
    ),
  )
  stops.push(() => Effect.runPromise(Fiber.interrupt(fiber)))
  // Let the Mount attach before anything happens.
  await new Promise(resolve => setTimeout(resolve, 20))
  return facts
}

const SHIFT = 8

/** The point `x`, `y` inside `element`'s padding box, in the page's coordinates. */
const at = (element: HTMLElement, x: number, y: number) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + element.clientLeft + x, y: box.top + element.clientTop + y }
}
const mouse = {
  down: (point: { x: number; y: number }, modifiers = 0) =>
    cdp().send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      modifiers,
    }),
  move: async (point: { x: number; y: number }, pressed = true, modifiers = 0) => {
    await cdp().send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...point,
      button: pressed ? 'left' : 'none',
      buttons: pressed ? 1 : 0,
      modifiers,
    })
  },
  up: (point: { x: number; y: number }, modifiers = 0) =>
    cdp().send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      modifiers,
    }),
}

/** Draws from `from` to `to` inside `element` in a few steps, holding `modifiers` at the release. */
const draw = async (
  element: HTMLElement,
  from: readonly [number, number],
  to: readonly [number, number],
  modifiers = 0,
) => {
  await mouse.move(at(element, ...from), false)
  await mouse.down(at(element, ...from))
  for (const step of [0.25, 0.5, 1]) {
    await mouse.move(
      at(element, from[0] + (to[0] - from[0]) * step, from[1] + (to[1] - from[1]) * step),
    )
  }
  await mouse.up(at(element, ...to), modifiers)
}

const ended = (facts: ReadonlyArray<LassoFact>) =>
  facts.filter((fact): fact is LassoEnded => fact._tag === 'LassoEnded')

it('selects what the rectangle touches, not what lies just beyond it', async () => {
  const element = surface([
    ['a', 20, 20],
    ['b', 100, 20],
    ['c', 20, 100],
  ])
  const facts = await watch(element)
  // From (10, 10) to (100, 100): an edge on `b`'s, which starts at x 100, and on `c`'s.
  await draw(element, [10, 10], [100, 100])
  await vi.waitFor(() =>
    expect(ended(facts)).toEqual([LassoEnded.make({ ids: ['a'], shiftKey: false })]),
  )
  expect(facts[0]).toEqual(LassoStarted.make({ x: 10, y: 10 }))
  expect(facts.at(-2)).toEqual(
    LassoMoved.make({
      rect: { left: 10, top: 10, width: 90, height: 90 },
      ids: ['a'],
      shiftKey: false,
    }),
  )
  facts.length = 0
  await draw(element, [10, 10], [101, 101])
  await vi.waitFor(() =>
    expect(ended(facts)).toEqual([LassoEnded.make({ ids: ['a', 'b', 'c'], shiftKey: false })]),
  )
})

it('starts on neither an item nor a control', async () => {
  const element = surface([['a', 20, 20]])
  const facts = await watch(element)
  await draw(element, [40, 40], [150, 150])
  const button = element.querySelector('button')!
  const box = button.getBoundingClientRect()
  const inside = element.getBoundingClientRect()
  await draw(element, [box.left - inside.left + 5, box.top - inside.top + 5], [150, 150])
  await draw(element, [200, 200], [210, 210])
  await vi.waitFor(() => expect(ended(facts)).toHaveLength(1))
  expect(facts.filter(fact => fact._tag === 'LassoStarted')).toEqual([
    LassoStarted.make({ x: 200, y: 200 }),
  ])
})

it('waits for the pointer to move past the threshold', async () => {
  const element = surface([['a', 20, 20]])
  const facts = await watch(element)
  await mouse.move(at(element, 10, 10), false)
  await mouse.down(at(element, 10, 10))
  await mouse.move(at(element, 12, 11))
  await mouse.up(at(element, 12, 11))
  await draw(element, [200, 200], [205, 200])
  await vi.waitFor(() => expect(ended(facts)).toHaveLength(1))
  expect(facts[0]).toEqual(LassoStarted.make({ x: 200, y: 200 }))
})

it('says Shift was held at the release', async () => {
  const element = surface([['a', 20, 20]])
  const facts = await watch(element)
  await draw(element, [10, 10], [70, 70], SHIFT)
  await vi.waitFor(() =>
    expect(ended(facts)).toEqual([LassoEnded.make({ ids: ['a'], shiftKey: true })]),
  )
})

it('cancels on Escape, and the release after selects nothing', async () => {
  const element = surface([['a', 20, 20]])
  const facts = await watch(element)
  let escapes = 0
  document.addEventListener('keydown', () => escapes++)
  await mouse.move(at(element, 10, 10), false)
  await mouse.down(at(element, 10, 10))
  await mouse.move(at(element, 70, 70))
  element.tabIndex = -1
  element.focus()
  await userEvent.keyboard('{Escape}')
  await mouse.move(at(element, 80, 80))
  await mouse.up(at(element, 80, 80))
  await vi.waitFor(() => expect(facts.at(-1)).toEqual(LassoCancelled.make({})))
  expect(ended(facts)).toEqual([])
  expect(escapes).toBe(0)
})

it('keeps the press on the content when the surface scrolls under a held pointer', async () => {
  const element = surface([
    ['a', 20, 20],
    ['deep', 20, 250],
  ])
  element.style.height = '120px'
  const facts = await watch(element)
  await mouse.move(at(element, 10, 10), false)
  await mouse.down(at(element, 10, 10))
  await mouse.move(at(element, 70, 70))
  element.scrollTop = 200
  await vi.waitFor(() =>
    expect(facts.at(-1)).toEqual(
      LassoMoved.make({
        rect: { left: 10, top: 10, width: 60, height: 260 },
        ids: ['a', 'deep'],
        shiftKey: false,
      }),
    ),
  )
  await mouse.up(at(element, 70, 70))
  await vi.waitFor(() =>
    expect(ended(facts)).toEqual([LassoEnded.make({ ids: ['a', 'deep'], shiftKey: false })]),
  )
})

it('keeps two surfaces apart', async () => {
  const one = surface([['a', 20, 20]])
  const two = surface([['a', 20, 20]])
  const ofOne = await watch(one)
  const ofTwo = await watch(two)
  await draw(two, [10, 10], [70, 70])
  await vi.waitFor(() =>
    expect(ended(ofTwo)).toEqual([LassoEnded.make({ ids: ['a'], shiftKey: false })]),
  )
  expect(ofOne).toEqual([])
})

// A page: the ids go to `Selection`, the count to `LiveAnnounce`, the rectangle to the view.

const Picked = Bundle.declare(Selection.bundle, 'picked')
const Said = Bundle.declare(LiveAnnounce.bundle, 'said')
const Model = Schema.Struct({
  ...Picked.fields,
  ...Said.fields,
  lasso: Schema.Option(LassoRect),
  cleared: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Picked.cases,
  ...Said.cases,
  Lassoed: {
    fact: Schema.Union([LassoStarted, LassoMoved, LassoEnded, LassoCancelled]),
  },
  ClickedSurface: {},
})
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(
  Page.at(Picked, { args: { mode: 'multiple', allowEmpty: true } }),
  Page.at(Said, { args: { debounceMs: 0, clearAfterMs: 60_000 } }),
)
const [picked, said] = placements.placements

const BoardSlots = Slots.define({
  board: Slot.make({ capability: Capability.Container }),
})
const lasso = LassoBehavior.behavior(BoardSlots)<Model, Message>({
  surface: 'board',
  attribute: 'data-item',
  toMessage: fact => Message.Lassoed({ fact }),
})

type Return = Update.Return<Model, Message>

const lassoed = (model: Model, fact: LassoFact): Return =>
  Match.valueTags(fact, {
    LassoStarted: ({ x, y }): Return => ({
      model: { ...model, lasso: Option.some({ left: x, top: y, width: 0, height: 0 }) },
    }),
    LassoMoved: ({ rect }): Return => ({ model: { ...model, lasso: Option.some(rect) } }),
    LassoCancelled: (): Return => ({ model: { ...model, lasso: Option.none() } }),
    LassoEnded: ({ ids, shiftKey }): Return => {
      const chosen = picked.helpers.replace(shiftKey ? [...model.picked.selected, ...ids] : ids)({
        ...model,
        lasso: Option.none(),
      })
      const count = chosen.model.picked.selected.length
      const told = said.helpers.announce(`${count} selected`)(chosen.model)
      return { model: told.model, commands: [...(chosen.commands ?? []), ...(told.commands ?? [])] }
    },
  })

const update = placements.update(
  (model: Model, message: Bundle.OwnMessage<Message, typeof placements.placements>): Return =>
    Match.valueTags(message, {
      Lassoed: ({ fact }): Return => lassoed(model, fact),
      ClickedSurface: (): Return => ({ model: { ...model, cleared: model.cleared + 1 } }),
    }),
)

const items: ReadonlyArray<readonly [string, number, number]> = [
  ['a', 20, 20],
  ['b', 100, 20],
  ['c', 20, 100],
]

const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(BoardSlots, [lasso.mixin], { input: model, h })
  return h.div(
    [],
    [
      h.div(
        builders.board.attrs([
          h.Id('board'),
          h.OnClick(Message.ClickedSurface()),
          h.Style({ position: 'relative', width: '400px', height: '300px', background: '#eee' }),
        ]),
        [
          ...items.map(([id, left, top]) =>
            h.div(
              [
                h.Attribute('data-item', id),
                h.AriaSelected(model.picked.selected.includes(id)),
                h.Style({
                  position: 'absolute',
                  left: `${left}px`,
                  top: `${top}px`,
                  width: '40px',
                  height: '40px',
                }),
              ],
              [id],
            ),
          ),
          ...Option.match(model.lasso, {
            onNone: () => [],
            onSome: rect => [
              h.div(
                [
                  h.Id('lasso'),
                  h.Style({
                    position: 'absolute',
                    pointerEvents: 'none',
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                  }),
                ],
                [],
              ),
            ],
          }),
        ],
      ),
      h.div([h.Id('cleared')], [String(model.cleared)]),
      LiveAnnounce.view(model.said, h),
    ],
  )
}

let dispose = () => {}

it('hands the ids to Selection, adds with Shift, announces the count, and swallows its click', async () => {
  const container = document.createElement('div')
  container.id = 'lasso-page'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => placements.initial({ lasso: Option.none(), cleared: 0 }),
      update,
      view,
      slow: false,
    }),
  ).dispose
  await vi.waitFor(() => expect(document.getElementById('board')).not.toBeNull())
  const board = document.getElementById('board')!
  const selected = () =>
    Array.from(board.querySelectorAll('[aria-selected="true"]')).map(item =>
      item.getAttribute('data-item'),
    )
  const polite = () => document.querySelector('[data-foldkit-plus-live="polite"]')?.textContent

  await mouse.move(at(board, 10, 10), false)
  await mouse.down(at(board, 10, 10))
  await mouse.move(at(board, 80, 80))
  await vi.waitFor(() => expect(document.getElementById('lasso')?.style.width).toBe('70px'))
  await mouse.up(at(board, 80, 80))
  await vi.waitFor(() => expect(selected()).toEqual(['a']))
  expect(document.getElementById('lasso')).toBeNull()
  await vi.waitFor(() => expect(polite()).toBe('1 selected'))

  await draw(board, [90, 10], [150, 70], SHIFT)
  await vi.waitFor(() => expect(selected()).toEqual(['a', 'b']))
  await vi.waitFor(() => expect(polite()).toBe('2 selected'))

  await draw(board, [10, 90], [70, 150])
  await vi.waitFor(() => expect(selected()).toEqual(['c']))
  // No lasso's release reached the surface's own click.
  expect(document.getElementById('cleared')?.textContent).toBe('0')
  await mouse.move(at(board, 300, 200), false)
  await mouse.down(at(board, 300, 200))
  await mouse.up(at(board, 300, 200))
  await vi.waitFor(() => expect(document.getElementById('cleared')?.textContent).toBe('1'))
})
