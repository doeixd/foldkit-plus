/**
 * The state of a dismissible list: a filter field, a clear-all button, and
 * keyed tag rows, one of which holds a nested branch. `view.ts` draws it with
 * focus recovery.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

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
