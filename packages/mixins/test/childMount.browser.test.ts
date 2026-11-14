/**
 * A Submodel's `OnMount`, handed to a parent's Slot inside a child attribute,
 * runs beside a Behavior's Mount on that Slot, and each sends through its own
 * boundary: the child's Message reaches the parent lifted, the Behavior's as
 * it is (#531). Foldkit keeps one `OnMount` per element, so before the fix one
 * of the two never ran.
 */
import { Schema, Stream } from 'effect'
import { childAttributes, type ChildAttribute, type Html } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { MountAction } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { defineView } from 'foldkit/submodel'
import { modifyFields } from 'foldkit/struct'
import { afterEach, expect, test } from 'vitest'
import { Behavior, Capability, Slot, SlotView, Slots } from '../src/index.js'

const ChildMessage = defineMessageUnion({ ChildMounted: {} })
type ChildMessage = typeof ChildMessage.Type

const Message = defineMessageUnion({
  GotChild: { message: ChildMessage },
  BehaviorMounted: {},
})
type Message = typeof Message.Type

const Model = Schema.Struct({ child: Schema.Struct({}), heard: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const childMount: MountAction<ChildMessage> = {
  name: 'ChildMount',
  f: () => Stream.succeed(ChildMessage.ChildMounted()),
}
const behaviorMount: MountAction<Message> = {
  name: 'BehaviorMount',
  f: () => Stream.succeed(Message.BehaviorMounted()),
}

/** A child that publishes its Mount for the parent to draw. */
const Child = defineView<
  Model['child'],
  ChildMessage,
  { readonly toView: (given: ReadonlyArray<ChildAttribute>) => Html }
>((_model, inputs, h) => inputs.toView(childAttributes([h.OnMount(childMount)])))

const PanelSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const Panel = SlotView.over(PanelSlots)<
  { readonly given: ReadonlyArray<ChildAttribute> },
  Message
>()
const Measures = Panel.behavior({ root: { mount: () => behaviorMount } }, { name: 'Measures' })
const PanelView = Panel.define((input, slots, h) =>
  h.div([h.Id('panel'), ...slots.root.attrs(input.given)], ['panel']),
).pipe(Behavior.attach(Measures))

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

test('a child attribute’s Mount and a Behavior’s Mount on one Slot both run', async () => {
  const container = document.createElement('div')
  container.id = 'child-mount'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { child: {}, heard: [] } }),
      update: (model: Model, message: Message) => ({
        model: modifyFields(model, { heard: () => [...model.heard, message._tag] }),
      }),
      view: (model, h) =>
        h.main(
          [],
          [
            h.submodel({
              slotId: 'child',
              model: model.child,
              view: Child,
              viewInputs: { toView: given => PanelView({ given }, h) },
              toParentMessage: message => Message.GotChild({ message }),
            }),
            h.p([h.Id('heard')], [[...model.heard].sort().join(' ')]),
          ],
        ),
    }),
  )
  await expect
    .poll(() => document.getElementById('heard')?.textContent)
    .toBe('BehaviorMounted GotChild')
})
