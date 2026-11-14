/// <reference types="@vitest/browser-playwright" />
/**
 * Escape in a `DismissLayer` layer under real presses, with one router on the
 * layer's search input: `ListNavigation.keys` and an Escape route that clears
 * the query. An Escape the input handled (it cleared) does not dismiss the
 * layer; one it declined (nothing to clear) does. The arrows of the same
 * router move the list's pointer.
 */
import { Match, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { DismissLayer, ListNavigation } from '../src/interaction/index.js'

const { Keys } = Behaviors

const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Stack = Bundle.declare(DismissLayer.bundle, 'layers')
const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: true,
  timeoutMs: 500,
  page: 3,
} as const

const Model = Schema.Struct({
  ...Nav.fields,
  ...Stack.fields,
  query: Schema.String,
  open: Schema.Boolean,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ...Nav.cases,
  ...Stack.cases,
  Typed: { value: Schema.String },
  Cleared: {},
})
type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Stack, {
    onOut: (out: DismissLayer.Dismiss) => (model: Model) => ({
      model: out.ids.includes('search-layer') ? modifyFields(model, { open: () => false }) : model,
    }),
  }),
)
const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Typed: ({ value }) => ({ model: modifyFields(model, { query: () => value }) }),
    Cleared: () => ({ model: modifyFields(model, { query: () => '' }) }),
  }),
)

const FRUITS = ['apple', 'banana', 'cherry']
const fruits = Behaviors.Collection.of(FRUITS, { id: fruit => fruit })

const SearchSlots = Slots.define({
  layer: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown, Event.Input] }),
})
const Search = SlotView.over(SearchSlots)<Model, Message>()

const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  routes: [
    Keys.route('EscapeClears', {
      on: [Keys.chord('Escape')],
      handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
    }),
    ListNavigation.keys(
      Nav,
      navArgs,
    )<Model, Message>({
      items: () => fruits,
      text: (_input, index) => FRUITS[index] ?? '',
      typeahead: false,
    }),
  ],
})
const Layer = DismissLayer.behavior(Stack)(SearchSlots)<Model, Message>({
  layer: 'layer',
  id: () => 'search-layer',
})

const SearchLayer = Search.define((model, slots, h) =>
  model.open
    ? h.div(slots.layer.attrs([h.Id('layer')]), [
        h.input(
          slots.input.attrs([
            h.Id('search'),
            h.Value(model.query),
            h.OnInput(value => Message.Typed({ value })),
          ]),
        ),
        h.p([h.Id('current')], [model.nav.current ?? '']),
      ])
    : h.p([h.Id('closed')], ['closed']),
).pipe(Behavior.attach(SearchKeys), Behavior.attach(Layer))

/** What the document saw of each keydown, after the input's handler had run. */
let seen: Array<{ key: string; prevented: boolean }> = []
const record = (event: KeyboardEvent) =>
  seen.push({ key: event.key, prevented: event.defaultPrevented })

let handle: { dispose: () => void } | undefined

beforeEach(async () => {
  seen = []
  document.addEventListener('keydown', record)
  const container = document.createElement('div')
  container.id = 'layer-host'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => assembly.initial({ query: '', open: true }),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => h.main([], [SearchLayer(model, h)]),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
  await expect.poll(() => document.getElementById('search')).not.toBeNull()
})

afterEach(() => {
  document.removeEventListener('keydown', record)
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const field = () => document.getElementById('search') as HTMLInputElement
const isOpen = () => document.getElementById('layer') !== null
const frames = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

const focusField = async () => {
  field().focus()
  await expect.poll(() => document.activeElement).toBe(field())
}

test('an Escape the input handled clears it and does not dismiss the layer', async () => {
  await focusField()
  await userEvent.keyboard('abc')
  await expect.poll(() => field().value).toBe('abc')
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => field().value).toBe('')
  await frames()
  expect(isOpen()).toBe(true)
  expect(seen.filter(press => press.key === 'Escape')).toEqual([{ key: 'Escape', prevented: true }])
})

test('an Escape the input declined dismisses the layer', async () => {
  await focusField()
  await userEvent.keyboard('{Escape}')
  await expect.poll(isOpen).toBe(false)
  expect(seen).toEqual([{ key: 'Escape', prevented: false }])
})

test('the second Escape, with nothing left to clear, dismisses', async () => {
  await focusField()
  await userEvent.keyboard('ab{Escape}')
  await expect.poll(() => field().value).toBe('')
  await frames()
  expect(isOpen()).toBe(true)
  await userEvent.keyboard('{Escape}')
  await expect.poll(isOpen).toBe(false)
})

test('the arrows of the same router move the list pointer, and DOM focus stays in the input', async () => {
  await focusField()
  await userEvent.keyboard('{ArrowDown}')
  await expect.poll(() => document.getElementById('current')?.textContent).toBe('apple')
  await userEvent.keyboard('{ArrowDown}')
  await expect.poll(() => document.getElementById('current')?.textContent).toBe('banana')
  expect(document.activeElement).toBe(field())
  expect(seen.map(press => [press.key, press.prevented])).toEqual([
    ['ArrowDown', true],
    ['ArrowDown', true],
  ])
  expect(isOpen()).toBe(true)
})
