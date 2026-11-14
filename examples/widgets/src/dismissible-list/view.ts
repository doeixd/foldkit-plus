/**
 * A dismissible list with a filter field, a clear-all button, and keyed tag
 * rows, one of which holds a nested branch. Each row's remove button takes the
 * row with it, so the row is a `FocusRecovery.part`: focus moves to the next
 * row, to the previous one when it was last, and to the field when the last row
 * names it. The nested branch's child falls back to the row that holds it.
 *
 * The field's id holds characters no unescaped selector could ask for, and the
 * fallback is found by id, so nothing here depends on the id being CSS-safe.
 */
import { Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { FocusRecovery } from 'foldkit-primitives/interaction'
import { dismissibleListStyle } from '../style.js'
import { FILTER_ID, Message, initial, update, type Model } from './app.js'

export const DismissibleListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  filter: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
  clear: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const View = SlotView.forMessages<Message>().define(
  DismissibleListSlots,
  (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.input(
        slots.filter.attrs([
          h.Id(FILTER_ID),
          h.Value(model.filter),
          h.OnInput(value => Message.Typed({ value })),
          h.Placeholder('Filter tags'),
          h.AriaLabel('Filter tags'),
        ]),
      ),
      h.button(slots.clear.attrs([h.Type('button'), h.OnClick(Message.Cleared())]), ['Clear all']),
      h.ul(
        [],
        model.tags.map((tag, index) =>
          h.li(
            [
              h.Key(tag.id),
              ...FocusRecovery.part(h, index === model.tags.length - 1 ? { to: FILTER_ID } : {}),
            ],
            [
              h.span([], [tag.label]),
              h.button(
                slots.remove.attrs([h.Type('button'), h.OnClick(Message.Removed({ id: tag.id }))]),
                [`Remove ${tag.label}`],
              ),
              ...(tag.children.length === 0
                ? []
                : [
                    h.ul(
                      [],
                      tag.children.map(child =>
                        h.li(
                          [h.Key(child.id)],
                          [
                            h.span([], [child.label]),
                            h.button(
                              slots.remove.attrs([
                                h.Type('button'),
                                h.OnClick(Message.RemovedChild({ id: child.id })),
                              ]),
                              [`Remove ${child.label}`],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ]),
            ],
          ),
        ),
      ),
    ]),
)

export const DismissibleList = View.pipe(
  Behavior.attach(
    FocusRecovery.behavior(DismissibleListSlots)<Model, Message>({ container: 'root' }),
  ),
  Style.attach(dismissibleListStyle(DismissibleListSlots)),
)

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const ids = (current: Model) => current.tags.map(tag => tag.id).join(',')
  const lines = [`start: tags=${ids(model)}`]
  model = update(model, Message.RemovedChild({ id: 'draft' })).model
  lines.push(`removed the draft branch: tags=${ids(model)}`)
  model = update(model, Message.Removed({ id: 'design' })).model
  lines.push(`removed design: tags=${ids(model)}`)
  model = update(model, Message.Cleared()).model
  lines.push(`cleared: tags=${ids(model) || 'none'}`)
  return lines
}
