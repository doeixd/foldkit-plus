/**
 * `policies` on `Data.wiring` is keyed by the active record's keys: a key the
 * record lacks is a type error, each case alone so none hides another.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Remote, RemotePolicy } from '../src/index.js'

const Note = DomainEntity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Body = DomainEntity.select(Note, { body: true })
const Model = Schema.Struct({ remote: Remote.Model, online: Schema.Boolean })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Note] })

const actives = {
  grid: Data.active('grid', () => Option.some(Data.get(Body, 'n1'))),
  feed: Data.active('feed', () => Option.some(Data.get(Body, 'n2'))),
}
const ageing = RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 })

Data.wiring(actives, { policy: ageing, policies: { grid: RemotePolicy.cacheFirst } })
Data.wiring(actives, {
  policies: { feed: (model: Model) => (model.online ? ageing : RemotePolicy.cacheOnly) },
})
Data.wiring(actives, { policies: { grid: ageing, feed: ageing }, shared: ['MutationFailed'] })

// @ts-expect-error a key the active record does not hold
Data.wiring(actives, { policies: { gird: ageing } })

// @ts-expect-error a policy is a RemotePolicy or a function of the Model
Data.wiring(actives, { policies: { grid: 'cacheFirst' } })

Data.wiring(
  { grid: actives.grid },
  {
    policies: {
      // @ts-expect-error a key of another record is no key of this one
      feed: ageing,
    },
  },
)

// The wiring's entries are named by the record's keys: a read entry needs no `!`.
const wiring = Data.wiring(actives, { policies: { grid: ageing } })
export const expires: number | undefined = wiring.subscriptions['grid.read'].modelToDependencies(
  {} as Model,
).expires?.at
void wiring.subscriptions['feed.live']
void wiring.subscriptions.retain

// @ts-expect-error no Surface is active under `gird`
void wiring.subscriptions['gird.read']
