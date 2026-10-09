/**
 * An accordion's state: the open section's id, or nothing open. One section
 * opens at a time; clicking the open one closes it.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const ISLAND = 'accordion'

/** Element id of a section's panel. The trigger's `aria-controls` names it. */
export const contentId = (id: string): string => `${ISLAND}/${id}-content`

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'

/** The section after a click: the open one shuts, any other opens. */
export const toggled = (open: Option.Option<string>, id: string): Option.Option<string> =>
  Option.isSome(open) && open.value === id ? Option.none() : Option.some(id)

export interface Section {
  readonly id: string
  readonly title: string
  readonly body: string
}

export const SECTIONS: ReadonlyArray<Section> = [
  { id: 'billing', title: 'Billing', body: 'Seats, invoices, and receipts.' },
  { id: 'team', title: 'Team', body: 'Invite, remove, and assign roles.' },
  { id: 'keys', title: 'API keys', body: 'Mint, scope, and revoke keys.' },
]

export const Model = Schema.Struct({
  open: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ToggledSection: { id: Schema.String },
})
export type Message = typeof Message.Type

export const initial: Model = { open: Option.none() }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'ToggledSection':
      return { model: { ...model, open: toggled(model.open, message.id) } }
  }
}
