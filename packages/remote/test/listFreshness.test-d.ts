import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import {
  Remote,
  RemotePolicy,
  type Connection,
  type ReadDeadline,
  type RemoteMessage,
} from '../src/index.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })
const Page = App.surface('Page', {
  model: () => ({ project: Data.get(Entity.select(Project, { name: true }), 'p1') }),
})
declare const model: Model

const read = Data.subscriptions(
  { page: Page },
  { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 }) },
)['page.read']
const deps = read.modelToDependencies(model)
expectTypeOf(deps.refreshing).toEqualTypeOf<ReadonlyArray<string>>()
expectTypeOf(deps.expires).toEqualTypeOf<ReadDeadline | null>()
expectTypeOf<ReadDeadline['connections']>().toEqualTypeOf<ReadonlyArray<string>>()

// A list is dated: a Connection built by hand says when.
const dated: Connection = { segments: [], stale: false, receivedAt: 0 }
// @ts-expect-error a Connection without its age
const undated: Connection = { segments: [], stale: false }

// `RefreshStarted` names lists by identity.
const refresh: RemoteMessage = { _tag: 'RefreshStarted', requests: [], connections: ['Feed'] }
const wrong: RemoteMessage = {
  _tag: 'RefreshStarted',
  requests: [],
  // @ts-expect-error a list is named by its identity, not by a ref
  connections: [{ identity: 'Feed' }],
}

// A retention root says whether its list ages, and no more.
const roots = Data.subscriptions({ page: Page }).retain.modelToDependencies(model)
expectTypeOf(roots.connections[0]!.ages).toEqualTypeOf<boolean | undefined>()

void [dated, undated, refresh, wrong]
