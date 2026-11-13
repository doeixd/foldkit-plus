import { Option, Schema } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Behavior, Behaviors, Capability, Event, Slot, Slots, SlotView } from '../src/index.js'

const Model = Schema.Struct({
  value: Schema.String,
  clears: Schema.Number,
  opens: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
  Opened: {},
})
type Message = typeof Message.Type

const Fields = Slots.define({
  input: Slot.make({ capability: Capability.TextInput, events: [Event.Input, Event.KeyDown] }),
})
const Routes = Behaviors.Keyboard.behavior(Fields)<Model, Message>({
  target: 'input',
  routes: [
    { name: 'Clear', key: 'Escape', toMessage: () => Option.some(Message.Cleared()) },
    { name: 'Open', key: 'ArrowDown', toMessage: () => Option.some(Message.Opened()) },
  ],
})
const View = SlotView.forMessages<Message>()
  .define(Fields, (model: Model, slots, h) =>
    h.div(
      [],
      [
        h.input(
          slots.input.attrs([
            h.Id('keyboard-fixture'),
            h.Value(model.value),
            h.OnInput(value => Message.Typed({ value })),
          ]),
        ),
        h.output([h.Id('clears')], [String(model.clears)]),
        h.output([h.Id('opens')], [String(model.opens)]),
      ],
    ),
  )
  .pipe(Behavior.attach(Routes))

let dispose = () => {}
let detach = () => {}
afterEach(() => {
  detach()
  dispose()
  document.body.replaceChildren()
})

const input = () => document.querySelector<HTMLInputElement>('#keyboard-fixture')!
const count = (id: string) => Number(document.getElementById(id)!.textContent)

const start = async () => {
  const container = document.createElement('div')
  container.id = 'keyboard-browser'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value: 'a', clears: 0, opens: 0 } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Typed: ({ value }) => ({ model: modifyFields(model, { value: () => value }) }),
          Cleared: () => ({
            model: modifyFields(model, { value: () => '', clears: count => count + 1 }),
          }),
          Opened: () => ({ model: modifyFields(model, { opens: count => count + 1 }) }),
        }),
      view: View,
    }),
  ).dispose
  const observed: Array<{ key: string; prevented: boolean }> = []
  const observe = (keydown: globalThis.KeyboardEvent) => {
    observed.push({ key: keydown.key, prevented: keydown.defaultPrevented })
  }
  document.addEventListener('keydown', observe)
  detach = () => document.removeEventListener('keydown', observe)
  await vi.waitFor(() => expect(document.querySelector('#keyboard-fixture')).not.toBeNull())
  input().focus()
  return observed
}

it('routes handled keys once, prevents their default, and leaves editing keys native', async () => {
  const observed = await start()
  await userEvent.keyboard('b')
  await vi.waitFor(() => expect(input().value).toBe('ab'))
  expect([count('clears'), count('opens')]).toEqual([0, 0])
  expect(observed.at(-1)).toEqual({ key: 'b', prevented: false })

  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(count('opens')).toBe(1))
  expect(observed.at(-1)).toEqual({ key: 'ArrowDown', prevented: true })
  expect(count('clears')).toBe(0)

  await userEvent.keyboard('{Backspace}')
  await vi.waitFor(() => expect(input().value).toBe('a'))
  expect(observed.at(-1)).toEqual({ key: 'Backspace', prevented: false })
  expect([count('clears'), count('opens')]).toEqual([0, 1])

  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(count('clears')).toBe(1))
  expect(input().value).toBe('')
  expect(observed.at(-1)).toEqual({ key: 'Escape', prevented: true })
  expect(count('opens')).toBe(1)
})

it('skips IME composition, requires the exact chord, and routes repeated keys', async () => {
  const observed = await start()
  input().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    }),
  )
  expect(count('clears')).toBe(0)
  expect(observed.at(-1)).toEqual({ key: 'Escape', prevented: false })

  input().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(count('opens')).toBe(0)
  expect(observed.at(-1)).toEqual({ key: 'ArrowDown', prevented: false })

  input().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
      repeat: true,
    }),
  )
  await vi.waitFor(() => expect(count('opens')).toBe(1))
  expect(observed.at(-1)).toEqual({ key: 'ArrowDown', prevented: true })
  expect(count('clears')).toBe(0)
})
