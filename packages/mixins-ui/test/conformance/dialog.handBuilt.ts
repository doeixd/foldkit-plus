/**
 * Two modal dialogs assembled from primitives, the second opened from the
 * first: `Overlay.behaviors` with the `modal` policy (a placed `DismissLayer`
 * for Escape and outside presses, `FocusScope` for focus in, containment and
 * restore, `ScrollLock`, `HideOutside`). The dialogs are plain elements with
 * `role="dialog"`: the browser's own modal handling is not doing any of it.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, Overlay } from 'foldkit-primitives/interaction'
import { Attr, Behavior, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'

const Stack = Bundle.declare(DismissLayer.bundle, 'stack')

const Model = Schema.Struct({
  ...Stack.fields,
  outer: Schema.Boolean,
  inner: Schema.Boolean,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Stack.cases, OpenedOuter: {}, OpenedInner: {} })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const Parts = Slots.define({
  dialog: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
})

interface Input {
  readonly id: 'outer' | 'inner'
  readonly title: string
  readonly body: ReadonlyArray<Html>
}

const Dialog = SlotView.over(Parts)<Input, Message>()

const policy = Overlay.behaviors<typeof Parts, Input, Message, 'stack'>(Dialog)({
  stack: Stack,
  layer: 'dialog',
  id: input => input.id,
  policy: Overlay.modal,
})

const view = Dialog.define(
  (input, slots, h) =>
    h.div(slots.dialog.attrs([h.Role('dialog'), h.AriaLabel(input.title), h.Tabindex(-1)]), [
      h.h2([], [input.title]),
      ...input.body,
    ]),
  { name: 'HandBuiltDialog' },
).pipe(...policy.map(each => Behavior.attach(each)))

export const mount = () => {
  const placed = Page.at(Stack, {
    onOut:
      ({ ids }) =>
      (model: Model) => ({
        model: {
          ...model,
          outer: ids.includes('outer') ? false : model.outer,
          inner: ids.includes('inner') ? false : model.inner,
        },
      }),
  })
  const placements = Bundle.assemble<Model, Message>()([placed])
  const container = document.createElement('div')
  container.id = 'conformance-hand-dialog'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => ({
          model: { stack: { layers: [] }, outer: false, inner: false },
        }),
        update: placements.update((model, message) =>
          Message.match(message, {
            OpenedOuter: () => ({ model: { ...model, outer: true } }),
            OpenedInner: () => ({ model: { ...model, inner: true } }),
            GotStackMessage: () => ({ model }),
          }),
        ),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              h.button([h.Id('open-outer'), h.OnClick(Message.OpenedOuter())], ['Open outer']),
              // The inner layer is drawn inside the outer one: the outer's `FocusScope` contains focus
              // to its own element, so a sibling layer would be pulled back out of.
              ...(model.outer
                ? [
                    view(
                      {
                        id: 'outer',
                        title: 'Outer',
                        body: [
                          h.button(
                            [h.Id('open-inner'), h.OnClick(Message.OpenedInner())],
                            ['Open inner'],
                          ),
                          ...(model.inner
                            ? [view({ id: 'inner', title: 'Inner', body: [] }, h)]
                            : []),
                        ],
                      },
                      h,
                    ),
                  ]
                : []),
            ],
          ),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
}
