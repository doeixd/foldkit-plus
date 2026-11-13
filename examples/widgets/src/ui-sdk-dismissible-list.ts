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
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Behavior, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { FocusRecovery } from 'foldkit-primitives/interaction'

export const Child = Schema.Struct({ id: Schema.String, label: Schema.String })
export const Tag = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  children: Schema.Array(Child),
})
export const Model = Schema.Struct({ filter: Schema.String, tags: Schema.Array(Tag) })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  Typed: { value: Schema.String },
  Removed: { id: Schema.String },
  RemovedChild: { id: Schema.String },
  Cleared: {},
})
export type Message = typeof Message.Type

export const FILTER_ID = 'tag-filter:a [b]'

export const initial: Model = {
  filter: '',
  tags: [
    { id: 'design', label: 'design', children: [{ id: 'draft', label: 'draft' }] },
    { id: 'release', label: 'release', children: [] },
    { id: 'backlog', label: 'backlog', children: [] },
  ],
}

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    Typed: ({ value }) =>
      value === model.filter ? { model } : { model: modifyFields(model, { filter: () => value }) },
    Removed: ({ id }) =>
      model.tags.some(tag => tag.id === id)
        ? { model: modifyFields(model, { tags: tags => tags.filter(tag => tag.id !== id) }) }
        : { model },
    RemovedChild: ({ id }) =>
      model.tags.some(tag => tag.children.some(child => child.id === id))
        ? {
            model: modifyFields(model, {
              tags: tags =>
                tags.map(tag => ({
                  ...tag,
                  children: tag.children.filter(child => child.id !== id),
                })),
            }),
          }
        : { model },
    Cleared: () =>
      model.tags.length === 0 ? { model } : { model: modifyFields(model, { tags: () => [] }) },
  })

export const TagSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  filter: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
  clear: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const View = SlotView.forMessages<Message>().define(TagSlots, (model: Model, slots, h) =>
  h.main(slots.root.attrs(), [
    h.input(
      slots.filter.attrs([
        h.Id(FILTER_ID),
        h.Value(model.filter),
        h.OnInput(value => Message.Typed({ value })),
        h.Placeholder('Filter tags'),
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

export const view = View.pipe(
  Behavior.attach(FocusRecovery.behavior(TagSlots)<Model, Message>({ container: 'root' })),
)
