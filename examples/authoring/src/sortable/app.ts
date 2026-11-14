/**
 * A listbox whose rows reorder, beside its roving stop and its selection.
 * `ListNavigation` owns the arrows, `Selection` owns Space, and `Reorder` takes
 * the arrows only while a row is held, so it asks for a chord of its own to
 * grab: Alt+Enter here. The list is the Model's; `Moved` is a fact, and
 * `update` applies it.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { ListNavigation, Reorder, Selection } from 'foldkit-primitives/interaction'

export const Rows = Bundle.declare(Reorder.bundle, 'rows')
export const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
export const Picks = Bundle.declare(Selection.bundle, 'picks')

export const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 5,
} as const
export const pickArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Rows.fields,
  ...Nav.fields,
  ...Picks.fields,
  ids: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Rows.cases,
  ...Nav.cases,
  ...Picks.cases,
  /** Space on the row the keyboard is on: the parent's word, which `Selection`'s helper applies. */
  Selected: { id: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })

export const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Picked,
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => ({
      model: Reorder.OutMessage.match(fact, {
        Moved: move => modifyFields(model, { ids: ids => Reorder.apply(ids, move) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      }),
    }),
  }),
)

export const PRIORITIES: ReadonlyArray<string> = ['Urgent', 'High', 'Normal', 'Low']

export const initial = () => assembly.initial({ ids: PRIORITIES })

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Selected: ({ id }) => Picked.helpers.activate(id)(model),
  }),
)

export const currentOf = (model: Model): Option.Option<string> =>
  Option.fromNullishOr(model.nav.current)
