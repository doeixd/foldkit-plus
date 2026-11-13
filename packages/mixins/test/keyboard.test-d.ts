import { Option } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Behaviors, Capability, Event, Slot, Slots, SlotView } from '../src/index.js'
import type { TestMessage } from './resolverFixture.js'

const Fields = Slots.define({
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
})
type Input = { readonly enabled: boolean }

const Base = SlotView.forMessages<TestMessage>().define(Fields, (input: Input, slots, h) =>
  h.input(slots.input.attrs([h.Disabled(!input.enabled)])),
)

const routed = Behaviors.Keyboard.behavior(Fields)({
  target: 'input',
  routes: [
    {
      name: 'Clear',
      key: 'Escape',
      toMessage: (input: Input): Option.Option<TestMessage> =>
        input.enabled ? Option.some({ _tag: 'Clicked' }) : Option.none(),
    },
  ],
})

const Attached = Base.pipe(Behavior.attach(routed))
Attached({ enabled: true }, SlotView.inertBuilder<TestMessage>())
// @ts-expect-error the attached behavior still requires the view's input
Attached({}, SlotView.inertBuilder<TestMessage>())

Behaviors.Keyboard.behavior(Fields)({
  // @ts-expect-error the slot contract has no results slot
  target: 'results',
  routes: [],
})

const Foreign = defineMessageUnion({ SentElsewhere: {} })
const foreign = Behaviors.Keyboard.behavior(Fields)<Input, typeof Foreign.Type>({
  target: 'input',
  routes: [
    {
      name: 'Elsewhere',
      key: 'Escape',
      toMessage: () => Option.some(Foreign.SentElsewhere()),
    },
  ],
})
// @ts-expect-error a routed behavior cannot introduce a foreign Message
Base.pipe(Behavior.attach(foreign))

const wider = Behaviors.Keyboard.behavior(Fields)<
  Input & { readonly pending: boolean },
  TestMessage
>({
  target: 'input',
  routes: [
    {
      name: 'Clear while pending',
      key: 'Escape',
      toMessage: input => (input.pending ? Option.some({ _tag: 'Clicked' }) : Option.none()),
    },
  ],
})
const Widened = Base.pipe(Behavior.attach(wider))
// @ts-expect-error the routed behavior widens the input it needs
Widened({ enabled: true }, SlotView.inertBuilder<TestMessage>())
