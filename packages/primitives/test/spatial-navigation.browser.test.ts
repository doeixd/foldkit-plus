/**
 * SpatialNavigation on a real layout: two boards of absolutely placed cards
 * in one runtime, driven by real keys. What lies where is the browser's
 * layout, read when a key is handled.
 */
import { Match, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { SpatialNavigation } from '../src/interaction/index.js'

const Card = Schema.Struct({
  id: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  disabled: Schema.Boolean,
})
type Card = typeof Card.Type

const One = Bundle.declare(SpatialNavigation.bundle, 'one')
const Two = Bundle.declare(SpatialNavigation.bundle, 'two')
const Model = Schema.Struct({
  ...One.fields,
  ...Two.fields,
  cards: Schema.Array(Card),
  dir: Schema.Literals(['ltr', 'rtl']),
  height: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...One.cases,
  ...Two.cases,
  /** Moves a card, as an application that lets cards be dragged would. */
  Placed: { id: Schema.String, x: Schema.Number, y: Schema.Number },
})
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(
  Page.at(One, { args: { id: 'one' } }),
  Page.at(Two, { args: { id: 'two' } }),
)

const BoardSlots = Slots.define({
  board: Slot.make({ capability: Capability.Interactive }),
  card: Slot.make({ capability: Capability.Focusable }),
})
const described = (cards: ReadonlyArray<Card>) =>
  Behaviors.Collection.of(cards, { id: card => card.id, disabled: card => card.disabled })
const describedOf = new WeakMap<ReadonlyArray<Card>, Behaviors.Collection.Items<Card>>()
const itemsOf = (cards: ReadonlyArray<Card>) => {
  const known = describedOf.get(cards)
  if (known !== undefined) return known
  const items = described(cards)
  describedOf.set(cards, items)
  return items
}
const keysOne = SpatialNavigation.behavior(One, { id: 'one' })(BoardSlots)<Model, Message>({
  container: 'board',
  item: 'card',
  items: model => itemsOf(model.cards),
})
const keysTwo = SpatialNavigation.behavior(Two, { id: 'two' })(BoardSlots)<Model, Message>({
  container: 'board',
  item: 'card',
  items: model => itemsOf(model.cards),
})

const update = placements.update(
  (model: Model, message: Bundle.OwnMessage<Message, typeof placements.placements>) =>
    Match.valueTags(message, {
      Placed: ({ id, x, y }): Update.Return<Model, Message> => ({
        model: {
          ...model,
          cards: model.cards.map(card => (card.id === id ? { ...card, x, y } : card)),
        },
      }),
    }),
)

const board = (
  model: Model,
  h: HtmlBuilder<Message>,
  keys: typeof keysOne,
  name: string,
  inner: ReadonlyArray<Html>,
  style: Readonly<Record<string, string>>,
): Html => {
  const builders = SlotView.buildersFor(BoardSlots, [keys.mixin], { input: model, h })
  const items = itemsOf(model.cards)
  return h.div(
    builders.board.attrs([
      h.Id(name),
      h.Dir(model.dir),
      h.Style({
        position: 'relative',
        width: '400px',
        height: `${model.height}px`,
        overflow: 'auto',
        ...style,
      }),
    ]),
    [
      ...model.cards.map((card, index) =>
        h.div(
          builders.card.attrs(
            [
              h.DataAttribute('card', `${name}:${card.id}`),
              h.Style({
                position: 'absolute',
                left: `${card.x}px`,
                top: `${card.y}px`,
                width: '40px',
                height: '40px',
              }),
            ],
            items.slotItem(index),
          ),
          [card.id],
        ),
      ),
      ...inner,
    ],
  )
}

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      // Board two lies inside board one, below its cards.
      board(
        model,
        h,
        keysOne,
        'one',
        [board(model, h, keysTwo, 'two', [], { marginTop: '320px' })],
        {},
      ),
      h.button([h.Id('move-c'), h.OnClick(Message.Placed({ id: 'c', x: 100, y: 0 }))], ['Move c']),
    ],
  )

const card = (id: string, x: number, y: number, disabled = false): Card => ({ id, x, y, disabled })

/*
 *   a(0,0)            b(200,0)                 e(340,10)
 *        c(60,90)
 *   d(0,200)          f(200,200, disabled)     g(340,200)
 * The quotes and brackets in `q"[x]` keep any selector from being built of an id.
 */
const cards: ReadonlyArray<Card> = [
  card('a', 0, 0),
  card('q"[x]', 200, 0),
  card('c', 60, 90),
  card('d', 0, 200),
  card('e', 340, 10),
  card('f', 200, 200, true),
  card('g', 340, 200),
]

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const start = async (overrides: Partial<Pick<Model, 'cards' | 'dir' | 'height'>> = {}) => {
  const container = document.createElement('div')
  container.id = 'spatial-navigation'
  document.body.append(container)
  const runtime = Runtime.makeElement({
    Model,
    container,
    init: () => placements.initial({ cards, dir: 'ltr', height: 300, ...overrides }),
    update: (model: Model, message: Message) => update(model, message),
    view,
    slow: false,
  })
  dispose = Runtime.embed(runtime).dispose
  await vi.waitFor(() => expect(document.querySelector('[data-card]')).not.toBeNull())
}

const cardIn = (name: string, id: string): HTMLElement | null =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-card]')).find(
    element => element.dataset.card === `${name}:${id}`,
  ) ?? null

const focusedCard = () => (document.activeElement as HTMLElement | null)?.dataset.card

const press = async (key: string, expected: string) => {
  await userEvent.keyboard(key)
  await vi.waitFor(() => expect(focusedCard()).toBe(expected))
}

it('moves to the nearest card that way on an irregular board, and Home and End go by order', async () => {
  await start()
  cardIn('one', 'a')!.focus()
  await press('{ArrowRight}', 'one:q"[x]')
  await press('{ArrowRight}', 'one:e')
  await press('{ArrowLeft}', 'one:q"[x]')
  // `g` is 45° off at most; `c` is nearer but further off the axis.
  await press('{ArrowDown}', 'one:g')
  await press('{ArrowLeft}', 'one:d')
  await press('{ArrowUp}', 'one:a')
  await press('{End}', 'one:g')
  await press('{Home}', 'one:a')
})

it('stays where nothing lies that way', async () => {
  await start()
  cardIn('one', 'a')!.focus()
  await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(focusedCard()).toBe('one:a')
  expect(cardIn('one', 'a')!.tabIndex).toBe(0)
})

it('passes a disabled card by', async () => {
  await start()
  cardIn('one', 'd')!.focus()
  await press('{ArrowRight}', 'one:g')
})

it('measures the cards where they are at each press', async () => {
  await start()
  cardIn('one', 'a')!.focus()
  await press('{ArrowRight}', 'one:q"[x]')
  await press('{ArrowLeft}', 'one:a')
  // `c` moves to the right of `a`, nearer than `q"[x]`, between two presses.
  document.getElementById('move-c')!.click()
  await vi.waitFor(() => expect(cardIn('one', 'c')!.style.left).toBe('100px'))
  await press('{ArrowRight}', 'one:c')
})

it('two presses faster than a frame move twice', async () => {
  await start()
  cardIn('one', 'a')!.focus()
  await userEvent.keyboard('{ArrowRight}{ArrowRight}')
  await vi.waitFor(() => expect(focusedCard()).toBe('one:e'))
})

it('keeps left and right physical in a right-to-left board', async () => {
  await start({ dir: 'rtl' })
  cardIn('one', 'a')!.focus()
  await press('{ArrowRight}', 'one:q"[x]')
  await press('{ArrowLeft}', 'one:a')
})

it('scrolls a card into view in its board and leaves the page where it was', async () => {
  await start({
    cards: [card('top', 0, 0), card('far', 0, 900)],
    height: 120,
  })
  const one = document.getElementById('one')!
  const scrollY = window.scrollY
  cardIn('one', 'top')!.focus()
  await press('{ArrowDown}', 'one:far')
  const far = cardIn('one', 'far')!.getBoundingClientRect()
  const frame = one.getBoundingClientRect()
  expect(one.scrollTop).toBeGreaterThan(0)
  expect(far.top).toBeGreaterThanOrEqual(frame.top)
  expect(far.bottom).toBeLessThanOrEqual(frame.bottom)
  expect(window.scrollY).toBe(scrollY)
})

it('a board inside another keeps to its own cards', async () => {
  await start()
  cardIn('one', 'd')!.focus()
  await userEvent.keyboard('{ArrowDown}')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(focusedCard()).toBe('one:d')
})

it('keeps two boards with the same ids apart', async () => {
  await start()
  cardIn('two', 'a')!.focus()
  await press('{ArrowRight}', 'two:q"[x]')
  await vi.waitFor(() => expect(cardIn('two', 'q"[x]')!.tabIndex).toBe(0))
  expect(cardIn('one', 'a')!.tabIndex).toBe(0)
  expect(cardIn('one', 'q"[x]')!.tabIndex).toBe(-1)
})
