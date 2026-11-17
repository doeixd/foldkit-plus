/**
 * A child fold over one Model field: `read` lifts the field, `write` stores
 * it back, `toParentMessage` wraps the child's messages. Every fold repeats these
 * three lines around its own `update` and `foldOutMessage`, so each fold states
 * only what differs. `makeModifyFieldsFor` (not a bare object spread) keeps the
 * write typed: the transform is checked against the Model while the field stays generic.
 */
import { Option } from 'effect'
import { makeModifyFieldsFor } from 'foldkit/struct'

export const foldsFor = <Model extends Record<string, unknown>, Message>() => {
  const modifyModel = makeModifyFieldsFor<Model>()
  return <K extends keyof Model, ChildMessage>(
    field: K,
    wrap: (args: { readonly message: ChildMessage }) => Message,
  ): {
    readonly read: (model: Model) => Option.Option<Model[K]>
    readonly write: (model: Model, child: Model[K]) => Model
    readonly toParentMessage: (message: ChildMessage) => Message
  } => ({
    read: model => Option.some(model[field]),
    // The computed key keeps its association to the field through the mapped
    // type; an object literal would widen it to `string` and lose the check.
    write: (model, child) =>
      modifyModel(model, {
        [field]: () => child,
      } as unknown as Partial<{ [P in keyof Model]: (current: Model[P]) => Model[P] }>),
    toParentMessage: message => wrap({ message }),
  })
}
