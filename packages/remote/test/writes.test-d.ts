/**
 * `mutate` and `retry` are callable only on a domain that registers a mutation
 * (#378 4b): on one that registers none, every call is refused where it is made.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Mutation, Remote } from '../src/index.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
declare const model: Model

const Reads = Remote.make({ model: App.model.remote, entities: [Project] })
// @ts-expect-error a domain that registers no mutation refuses every one
Reads.mutate(model, Rename, { id: 'p1', name: 'Apollo' })
// @ts-expect-error and has nothing to retry
Reads.retry(model, 'r1')

const Writes = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })
Writes.mutate(model, Rename, { id: 'p1', name: 'Apollo' })
Writes.retry(model, 'r1')
