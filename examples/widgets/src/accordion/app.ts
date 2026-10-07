/**
 * An accordion's state: the open section's id, or nothing open. One section
 * opens at a time; clicking the open one closes it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

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
  open: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ToggledSection: { id: Schema.String },
})
export type Message = typeof Message.Type

export const initial: Model = { open: null }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'ToggledSection':
      return { model: { ...model, open: model.open === message.id ? null : message.id } }
  }
}
