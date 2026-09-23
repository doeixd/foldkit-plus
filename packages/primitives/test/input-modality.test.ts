// @vitest-environment jsdom
/**
 * InputModality: starts unknown, a key (not a modifier alone) means keyboard,
 * a pointer down means pointer, the same answer twice changes nothing, the
 * stream reports both from the window; FocusVisible writes its attribute only
 * under keyboard.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { InputModality, InputModalityMessage, modalityOfKey } from '../src/events/index.js'
import { FocusVisible } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const Input = Bundle.declare(InputModality, 'input')
const Model = Schema.Struct({ ...Input.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Input.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Input)
const send = (model: Model, message: InputModalityMessage) =>
  Option.getOrThrow(placed.update(model, Input.wrapper.make(message))).model

describe('InputModality', () => {
  it('starts unknown and follows the last input kind', () => {
    const start = placed.init({ input: { modality: 'pointer' } }).model
    expect(start.input.modality).toBe('unknown')
    const keyboard = send(start, InputModalityMessage.Changed({ modality: 'keyboard' }))
    expect(keyboard.input.modality).toBe('keyboard')
    expect(send(keyboard, InputModalityMessage.Changed({ modality: 'keyboard' })).input).toBe(
      keyboard.input,
    )
    expect(
      send(keyboard, InputModalityMessage.Changed({ modality: 'pointer' })).input.modality,
    ).toBe('pointer')
  })

  it('a modifier alone says nothing', () => {
    expect(modalityOfKey('Shift')).toBeNull()
    expect(modalityOfKey('Meta')).toBeNull()
    expect(modalityOfKey('Tab')).toBe('keyboard')
    expect(modalityOfKey('a')).toBe('keyboard')
  })

  it('reports keyboard and pointer from the window', async () => {
    const subscriptions = InputModality.subscriptions?.()
    const changes = subscriptions?.['changes']
    if (changes === undefined) throw new Error('no changes subscription')
    const messages = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(
            changes.dependenciesToStream({}, () => ({})),
            2,
          ),
        )
        for (let i = 0; i < 50; i++) yield* Effect.yieldNow
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Shift' }))
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab' }))
        window.dispatchEvent(new window.Event('pointerdown'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(messages).toEqual([
      InputModalityMessage.Changed({ modality: 'keyboard' }),
      InputModalityMessage.Changed({ modality: 'pointer' }),
    ])
  })
})

describe('FocusVisible.behavior', () => {
  const FieldSlots = Slots.define({ field: Slot.make({ capability: Capability.TextInput }) })
  const h = SlotView.inertBuilder<Message>()
  const Ring = FocusVisible.behavior(Input)(FieldSlots)<Model, Message>({ target: 'field' })
  const attrs = (modality: Model['input']['modality']) =>
    SlotView.buildersFor(FieldSlots, [Ring.mixin], {
      input: { input: { modality } },
      h,
    }).field.attrs()

  it('marks the target only while the page is driven by keyboard', () => {
    expect(Attributes.find(attrs('keyboard'), 'DataAttribute')).toMatchObject({
      key: 'focus-visible',
      value: 'true',
    })
    expect(attrs('pointer')).toEqual([])
    expect(attrs('unknown')).toEqual([])
  })
})
