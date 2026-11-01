/**
 * "How long a saved read lasts" in the README, type-checked: `persistence`'s
 * `maxAge`, a call's `persist`, and a `snapshot` built from the wiring's age.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Remote } from '../src/index.js'
import { persistence, RemotePersistence } from '../src/persistence.js'

const Message = DomainEntity.define(
  'Message',
  Schema.Struct({ id: Schema.String, subject: Schema.String }),
)
const Subject = DomainEntity.select(Message, { subject: true })
const Model = Schema.Struct({ remote: Remote.Model, userId: Schema.String })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Message] })

const inbox = { inbox: Data.active('inbox', () => Option.some(Data.get(Subject, 'm1'))) }
const account = { account: Data.active('account', () => Option.some(Data.get(Subject, 'm2'))) }

export const cache = persistence(Data, {
  key: model => `remote-cache:${model.userId}`,
  scope: model => model.userId,
  maxAge: 86_400_000, // a day, the default
  maxBytes: 512_000,
})

Data.subscriptions(inbox, { persist: { maxAge: 7 * 86_400_000 } }) // a week, for offline
Data.subscriptions(account, { persist: false }) // never written to the device
Data.wiring(account, { persist: false })

persistence(Data, {
  key: () => 'cache',
  scope: () => 'me',
  snapshot: (remote, { maxAge }) => RemotePersistence.snapshotOf(remote, { maxAge }),
})

// @ts-expect-error `persist` is `{ maxAge }` or `false`, not `true`
Data.subscriptions(inbox, { persist: true })
// @ts-expect-error a `maxAge` is milliseconds, not a Duration string
Data.subscriptions(inbox, { persist: { maxAge: '1 day' } })
