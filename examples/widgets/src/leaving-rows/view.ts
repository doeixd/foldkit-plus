/**
 * Rows and a popup that stay drawn while they leave. A row marked by
 * `leaving(h)` while its own presence is `hiding` is the `Leaving` Mount's to
 * make inert and move focus out of; `FocusRecovery` names where focus lands;
 * the popup adds `FocusScope` and `HideOutside`. Each hiding row has its own
 * `Keep`, drawn outside the row, since the row itself is inert.
 */
import { Capability, Event, Slot, Slots, SlotView, Behavior, Style } from 'foldkit-mixins'
import { FocusRecovery, FocusScope, Layers, Leaving } from 'foldkit-primitives/interaction'
import { isVisible } from 'foldkit-primitives/motion'
import { leavingRowsStyle } from '../style.js'
import {
  Message,
  closePopup,
  initial,
  isLeaving,
  openPopup,
  filterId,
  triggerId,
  update,
  type Model,
} from './app.js'

export const LeavingRowsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  filter: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  dismiss: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  keep: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  open: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  close: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const View = SlotView.forMessages<Message>().define(LeavingRowsSlots, (model: Model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.input(
      slots.filter.attrs([
        h.Id(filterId(model.scope)),
        h.Value(model.filter),
        h.OnInput(value => Message.Typed({ value })),
        h.Placeholder('Filter tags'),
        h.AriaLabel('Filter tags'),
      ]),
    ),
    h.button(
      slots.open.attrs([h.Id(triggerId(model.scope)), h.Type('button'), h.OnClick(openPopup)]),
      ['Open popup'],
    ),
    ...model.tags
      .filter(tag => isLeaving(model, tag.id))
      .map(tag =>
        h.button(slots.keep.attrs([h.Type('button'), h.OnClick(Message.Kept({ id: tag.id }))]), [
          `Keep ${tag.label}`,
        ]),
      ),
    h.ul(
      slots.list.attrs(),
      model.tags.map((tag, index) =>
        h.li(
          slots.row.attrs([
            h.Key(tag.id),
            ...FocusRecovery.part(
              h,
              index === model.tags.length - 1 ? { to: filterId(model.scope) } : {},
            ),
            ...(isLeaving(model, tag.id) ? Leaving.leaving(h) : []),
          ]),
          [
            h.span([], [tag.label]),
            h.button(
              slots.dismiss.attrs([h.Type('button'), h.OnClick(Message.Dismissed({ id: tag.id }))]),
              [`Remove ${tag.label}`],
            ),
            ...(tag.children.length === 0
              ? []
              : [
                  h.ul(
                    slots.list.attrs(),
                    tag.children.map(child =>
                      h.li(slots.row.attrs([h.Key(child.id)]), [
                        h.span([], [child.label]),
                        h.button(
                          slots.remove.attrs([
                            h.Type('button'),
                            h.OnClick(Message.RemovedChild({ id: child.id })),
                          ]),
                          [`Remove ${child.label}`],
                        ),
                      ]),
                    ),
                  ),
                ]),
          ],
        ),
      ),
    ),
    ...(isVisible(model.popup)
      ? [
          h.div(
            slots.panel.attrs([
              ...FocusRecovery.part(h, { to: triggerId(model.scope) }),
              ...(model.popup.phase === 'hiding' ? Leaving.leaving(h) : []),
            ]),
            [
              h.button(slots.close.attrs([h.Type('button'), h.OnClick(closePopup)]), [
                'Close popup',
              ]),
              h.button([h.Type('button'), h.DataAttribute('popup-action', '')], ['Dialog action']),
            ],
          ),
        ]
      : []),
  ]),
)

export const LeavingRows = View.pipe(
  Behavior.attach(FocusRecovery.behavior(LeavingRowsSlots)<Model, Message>({ container: 'root' })),
  Behavior.attach(Leaving.behavior(LeavingRowsSlots)<Model, Message>({ container: 'root' })),
  Behavior.attach(
    FocusScope.behavior(LeavingRowsSlots)<Model, Message>({
      container: 'panel',
      initialFocus: '[data-popup-action]',
    }),
  ),
  Behavior.attach(Layers.hideOutside(LeavingRowsSlots)<Model, Message>({ container: 'panel' })),
  Style.attach(leavingRowsStyle(LeavingRowsSlots)),
)

export const runDemo = (): ReadonlyArray<string> => {
  const phases = (model: Model) =>
    Object.entries(model.exits)
      .map(([id, presence]) => `${id}=${presence.phase}`)
      .join(' ')
  let model = initial.model
  const lines = [`start: ${phases(model)}`]
  model = update(model, Message.Dismissed({ id: 'design' })).model
  model = update(model, Message.Dismissed({ id: 'release' })).model
  lines.push(`dismissed design and release: ${phases(model)}`)
  model = update(model, Message.Kept({ id: 'release' })).model
  lines.push(`kept release: ${phases(model)}`)
  return lines
}
