/// <reference types="@vitest/browser-playwright" />
/**
 * `Behaviors.Keys` under real presses: routes on one input each send one
 * Message, keys they decline keep their native effect and are not prevented,
 * a held key runs its route per repeat, a press of an IME composition reaches
 * no route, and a focus answer moves focus in the handler.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from '../src/index.js'

const { Keys } = Behaviors

const Message = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
  OpenedResults: {},
  Moved: {},
  Jumped: {},
  JumpedFar: {},
})
type Message = typeof Message.Type

const Model = Schema.Struct({ query: Schema.String, heard: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown, Event.Input] }),
})
const Search = SlotView.over(SearchSlots)<Model, Message>()

const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  name: 'SearchKeys',
  routes: [
    Keys.route('EscapeClears', {
      on: [Keys.chord('Escape')],
      handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
    }),
    Keys.route('ArrowOpens', {
      on: [Keys.chord('ArrowDown', { alt: true })],
      handle: () => Option.some(Message.OpenedResults()),
    }),
    Keys.route('ArrowMoves', {
      on: [Keys.chord('ArrowDown')],
      handle: () => Option.some(Message.Moved()),
    }),
    Keys.route('EnterJumps', {
      on: [Keys.chord('Enter')],
      handle: () => Option.some(Keys.focus('after:1', Message.Jumped())),
    }),
    Keys.route('F2JumpsFar', {
      on: [Keys.chord('F2')],
      handle: () => Option.some(Keys.focus('far\nand "quoted" \\ id', Message.JumpedFar())),
    }),
  ],
})

const SearchField = Search.define((input, slots, h) =>
  h.div(slots.root.attrs(), [
    h.input(
      slots.input.attrs([
        h.Id('search'),
        h.Value(input.query),
        h.OnInput(value => Message.Typed({ value })),
      ]),
    ),
    h.button([h.Id('after:1')], ['after']),
    h.button([h.Id('far\nand "quoted" \\ id')], ['far']),
  ]),
).pipe(Behavior.attach(SearchKeys))

/** What the document saw of each keydown, after the input's handler had run. */
let seen: Array<{ key: string; prevented: boolean; repeat: boolean; composing: boolean }> = []
const record = (event: KeyboardEvent) =>
  seen.push({
    key: event.key,
    prevented: event.defaultPrevented,
    repeat: event.repeat,
    composing: event.isComposing,
  })

let handle: { dispose: () => void } | undefined

beforeEach(async () => {
  seen = []
  document.addEventListener('keydown', record)
  const container = document.createElement('div')
  container.id = 'keys'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { query: '', heard: [] } }),
      update: (model: Model, message: Message) => ({
        model: Message.match(message, {
          Typed: ({ value }) => modifyFields(model, { query: () => value }),
          Cleared: () =>
            modifyFields(model, { query: () => '', heard: () => [...model.heard, 'Cleared'] }),
          OpenedResults: () => modifyFields(model, { heard: () => [...model.heard, 'Opened'] }),
          Moved: () => modifyFields(model, { heard: () => [...model.heard, 'Moved'] }),
          Jumped: () => modifyFields(model, { heard: () => [...model.heard, 'Jumped'] }),
          JumpedFar: () => modifyFields(model, { heard: () => [...model.heard, 'JumpedFar'] }),
        }),
      }),
      view: (model, h) =>
        h.main([], [SearchField(model, h), h.p([h.Id('heard')], [model.heard.join(' ')])]),
    }),
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
const heard = () => document.getElementById('heard')?.textContent

const focusField = async () => {
  field().focus()
  await expect.poll(() => document.activeElement).toBe(field())
}

test('Escape clears and Alt+ArrowDown opens, one Message each, both prevented', async () => {
  await focusField()
  await userEvent.keyboard('abc')
  await expect.poll(() => field().value).toBe('abc')
  await userEvent.keyboard('{Escape}')
  await expect.poll(heard).toBe('Cleared')
  await expect.poll(() => field().value).toBe('')
  await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
  await expect.poll(heard).toBe('Cleared Opened')
  expect(
    seen.filter(press => press.key !== 'Alt').map(({ key, prevented }) => [key, prevented]),
  ).toEqual([
    ['a', false],
    ['b', false],
    ['c', false],
    ['Escape', true],
    ['ArrowDown', true],
  ])
})

test('a declined Escape is left alone: not prevented, and still seen above', async () => {
  await focusField()
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => seen.length).toBe(1)
  expect(seen[0]).toMatchObject({ key: 'Escape', prevented: false })
  expect(heard()).toBe('')
})

test('a letter, Home, a Shift+ArrowLeft selection and Backspace keep their native effect', async () => {
  await focusField()
  await userEvent.keyboard('abcd')
  await expect.poll(() => field().value).toBe('abcd')
  await userEvent.keyboard('{Home}')
  await expect.poll(() => field().selectionStart).toBe(0)
  await userEvent.keyboard('{End}{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}')
  await expect.poll(() => [field().selectionStart, field().selectionEnd]).toEqual([2, 4])
  await userEvent.keyboard('{Backspace}')
  await expect.poll(() => field().value).toBe('ab')
  expect(heard()).toBe('')
  expect(seen.some(press => press.prevented)).toBe(false)
})

const keyDown = (key: string, code: string, keyCode: number, autoRepeat: boolean) =>
  cdp().send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    autoRepeat,
  })

test('a held ArrowDown runs its route on every repeat', async () => {
  await focusField()
  await keyDown('ArrowDown', 'ArrowDown', 40, false)
  await keyDown('ArrowDown', 'ArrowDown', 40, true)
  await keyDown('ArrowDown', 'ArrowDown', 40, true)
  await cdp().send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowDown',
    code: 'ArrowDown',
    windowsVirtualKeyCode: 40,
  })
  await expect.poll(heard).toBe('Moved Moved Moved')
  expect(seen.map(press => press.repeat)).toEqual([false, true, true])
})

test('an Escape pressed during an IME composition reaches no route', async () => {
  await focusField()
  await userEvent.keyboard('abc')
  await expect.poll(() => field().value).toBe('abc')
  await cdp().send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 })
  await keyDown('Escape', 'Escape', 27, false)
  await expect.poll(() => seen.at(-1)?.key).toBe('Escape')
  // Proof the press was a composition's, not merely an Escape the route declined.
  expect(seen.at(-1)).toMatchObject({ composing: true, prevented: false })
  expect(heard()).toBe('')
  await cdp().send('Input.insertText', { text: '' })
})

test('a focus answer moves focus to an id no `#id` selector could name', async () => {
  await focusField()
  await userEvent.keyboard('{Enter}')
  await expect.poll(heard).toBe('Jumped')
  expect(document.activeElement?.id).toBe('after:1')
})

test('a focus answer reaches an id with a newline, a quote and a backslash', async () => {
  await focusField()
  await userEvent.keyboard('{F2}')
  await expect.poll(heard).toBe('JumpedFar')
  expect(document.activeElement?.id).toBe('far\nand "quoted" \\ id')
  expect(seen.at(-1)).toMatchObject({ key: 'F2', prevented: true })
})
