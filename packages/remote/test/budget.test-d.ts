import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { Remote, type Evicted, type RecentRoots, type RemoteMessage } from '../src/index.js'
import { type Why } from '../src/why.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

// A domain's budget is a count of entries.
Remote.make({ model: App.model.remote, entities: [Project], budget: 500 })
// @ts-expect-error a budget is a number of entries, not a size in words
Remote.make({ model: App.model.remote, entities: [Project], budget: '1 MB' })

// A retain entry wired by hand takes one too.
Remote.retain([], undefined, { budget: 10, grace: '1 second' })
// @ts-expect-error not a number
Remote.retain([], undefined, { budget: true })

const retention: RemoteMessage = {
  _tag: 'RetentionChanged',
  roots: { requirements: [], connections: [] },
  budget: 10,
}
const unbudgeted: RemoteMessage = {
  _tag: 'RetentionChanged',
  roots: { requirements: [], connections: [] },
  // @ts-expect-error a budget is a number
  budget: '10',
}

// What retention holds, and what the budget evicted, read off the Model.
declare const remote: typeof Remote.initial
expectTypeOf(remote.recent).toEqualTypeOf<RecentRoots>()
expectTypeOf(remote.evicted).toEqualTypeOf<Evicted>()

// `held` names an eviction.
expectTypeOf<Extract<Why, { readonly _tag: 'List' }>['held']>().toEqualTypeOf<
  'Missing' | 'Evicted' | 'Stale'
>()

void [retention, unbudgeted]
