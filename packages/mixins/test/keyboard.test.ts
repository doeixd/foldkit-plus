import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Attributes, Behaviors, Capability, Event, Slot, Slots, SlotView } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { fakeChild, h, type TestMessage } from './resolverFixture.js'

const Fields = Slots.define({
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
})
type Input = { readonly enabled: boolean }
const routes: ReadonlyArray<Behaviors.Keyboard.Route<Input, TestMessage>> = [
  {
    name: 'Clear',
    key: 'Escape',
    toMessage: input => (input.enabled ? Option.some({ _tag: 'Clicked' }) : Option.none()),
  },
  { name: 'Open', key: 'ArrowDown', toMessage: () => Option.some({ _tag: 'Other' }) },
]
const keys = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const attribute = (enabled: boolean) => {
  const route = Behaviors.Keyboard.behavior(Fields)<Input, TestMessage>({ target: 'input', routes })
  const attrs = SlotView.buildersFor(Fields, [route.mixin], { input: { enabled }, h }).input.attrs()
  const handler = Attributes.find(attrs, 'OnKeyDownPreventDefault')
  if (handler === undefined) throw new Error('missing keyboard handler')
  return handler
}

describe('Keyboard', () => {
  it('routes only exact gestures through one handler', () => {
    const handler = attribute(true)
    expect(handler.f('Escape', keys)).toEqual(Option.some({ _tag: 'Clicked' }))
    expect(handler.f('ArrowDown', keys)).toEqual(Option.some({ _tag: 'Other' }))
    expect(handler.f('Escape', { ...keys, shiftKey: true })).toEqual(Option.none())
    expect(handler.f('x', keys)).toEqual(Option.none())
    expect(attribute(false).f('Escape', keys)).toEqual(Option.none())
  })

  it('detects overlapping named routes including explicit false modifiers', () => {
    let failure: unknown
    try {
      Behaviors.Keyboard.behavior(Fields)<Input, TestMessage>({
        target: 'input',
        routes: [routes[0]!, { ...routes[0]!, name: 'Close', modifiers: { shiftKey: false } }],
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(DiagnosticError)
    expect((failure as DiagnosticError).diagnostic).toMatchObject({
      code: 'mixins:event-conflict',
      slot: 'input',
      details: { event: 'keydown', key: 'Escape', contributors: ['Clear', 'Close'] },
    })
  })

  it('allows separate modifier chords and refuses duplicate owners and protected keys', () => {
    const route = Behaviors.Keyboard.behavior(Fields)<Input, TestMessage>({
      target: 'input',
      routes: [routes[0]!, { ...routes[0]!, name: 'Shift clear', modifiers: { shiftKey: true } }],
    })
    const builders = () =>
      SlotView.buildersFor(Fields, [route.mixin], { input: { enabled: true }, h }).input
    expect(() => builders().attrs([h.OnKeyDown(() => ({ _tag: 'Other' }))])).toThrow(
      DiagnosticError,
    )
    expect(() => builders().attrs([fakeChild(h.OnKeyDown(() => ({ _tag: 'Other' })))])).toThrow(
      DiagnosticError,
    )
    const ProtectedFields = Slots.define({
      input: Slot.make({
        capability: Capability.TextInput,
        events: [Event.KeyDown],
        protected: { events: [Event.KeyDown] },
      }),
    })
    const protectedRoute = Behaviors.Keyboard.behavior(ProtectedFields)<Input, TestMessage>({
      target: 'input',
      routes,
    })
    expect(() =>
      SlotView.buildersFor(ProtectedFields, [protectedRoute.mixin], {
        input: { enabled: true },
        h,
      }).input.attrs(),
    ).toThrow(DiagnosticError)
  })
})
