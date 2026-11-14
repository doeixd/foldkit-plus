/**
 * Two checkboxes assembled from primitives: `Press` turns a pointer, Enter,
 * Space or an assistive technology's click into one `Pressed`, and
 * `ToggleState` writes `aria-checked` from the Model. The element is a plain
 * `span` with a role and a tab stop; nothing native does the work. The second
 * is disabled through `Press`, which silences its events.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Press } from 'foldkit-primitives/interaction'
import { A11y, Attr, Behavior, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'

const Subscribe = Bundle.declare(Press.bundle, 'subscribe')
const Locked = Bundle.declare(Press.bundle, 'locked')

const Model = Schema.Struct({
  ...Subscribe.fields,
  ...Locked.fields,
  isSubscribed: Schema.Boolean,
  isLocked: Schema.Boolean,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Subscribe.cases, ...Locked.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const Parts = Slots.define({
  checkbox: Slot.make({
    capability: Capability.Interactive,
    attributes: [Attr.Role, Attr.AriaChecked, Attr.AriaDisabled, Attr.AriaLabel],
  }),
})

const Pattern = A11y.pattern({
  checkbox: {
    capability: Capability.Interactive,
    obligations: [A11y.Activation, A11y.State(Attr.AriaChecked), A11y.Name],
  },
})

interface Input extends Model {
  readonly mine: 'isSubscribed' | 'isLocked'
}

const Box = SlotView.over(Parts)<Input, Message>()

const subscribePress = Press.behavior(Subscribe)(Box)({ target: 'checkbox' })
// `Press` silences a disabled target's events, so this one never reports a press.
const lockedPress = Press.behavior(Locked)(Box)({ target: 'checkbox', disabled: () => true })

const view = (press: typeof subscribePress) =>
  Box.define(
    (input, slots, h) =>
      h.span(
        slots.checkbox.attrs([
          h.Role('checkbox'),
          h.Tabindex(0),
          h.AriaLabel(input.mine === 'isSubscribed' ? 'Subscribe' : 'Locked'),
        ]),
        [],
      ),
    { name: 'HandBuiltCheckbox' },
  ).pipe(
    Behavior.attach(
      Behaviors.ToggleState.behavior(Box)({
        control: 'checkbox',
        state: input => input[input.mine],
        as: 'checked',
      }),
    ),
    Behavior.attach(press),
    SlotView.attach(A11y.base({ checkbox: [A11y.Name] })),
    A11y.conform(Pattern),
  )

const subscribeView = view(subscribePress)
const lockedView = view(lockedPress)

export const mount = () => {
  const subscribe = Page.at(Subscribe, {
    args: { clickSuppressionMs: 50 },
    onOut: () => (model: Model) => ({ model: { ...model, isSubscribed: !model.isSubscribed } }),
  })
  const locked = Page.at(Locked, {
    args: { clickSuppressionMs: 50 },
    onOut: () => (model: Model) => ({ model: { ...model, isLocked: !model.isLocked } }),
  })
  const container = document.createElement('div')
  container.id = 'conformance-hand-checkbox'
  document.body.appendChild(container)
  const idle = { pressed: false, pointerId: null, key: null, suppressing: null, generation: 0 }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { subscribe: idle, locked: idle, isSubscribed: false, isLocked: false },
      }),
      update: (model: Model, message: Message) =>
        Option.getOrElse(
          Option.orElse(subscribe.update(model, message), () => locked.update(model, message)),
          () => ({ model }),
        ),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            subscribeView({ ...model, mine: 'isSubscribed' }, h),
            lockedView({ ...model, mine: 'isLocked' }, h),
          ],
        ),
    }),
  )
}
