/** `writing`'s filter names a Mutation and a row, never a string (#251). */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Mutation, Remote, Writing, writing } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number }))
const input = Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number }))
const SetCount = Mutation.write('SetCount', Write.update(input, { id: 'id' }))
const Elsewhere = Mutation.write('Elsewhere', Write.update(input, { id: 'id' }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [SetCount] })
declare const model: typeof Model.Type

const all: Writing = writing(Data, model)
const one: Writing = writing(Data, model, { mutation: SetCount, row: Remote.ref(Item, 'i1') })

// @ts-expect-error a Mutation, not its name
writing(Data, model, { mutation: 'SetCount' })
// @ts-expect-error a Mutation the domain does not register
writing(Data, model, { mutation: Elsewhere })
// @ts-expect-error a row, not its id
writing(Data, model, { row: 'i1' })
// @ts-expect-error a row, not a key
writing(Data, model, { row: { entity: 'Item' } })

const said: string = Writing.match(all, {
  None: () => 'none',
  Sending: ({ requestIds }) => `${requestIds.length}`,
  Unanswered: () => 'unanswered',
  WaitingForSignIn: () => 'sign in',
  Unreadable: () => 'unreadable',
  Failed: () => 'failed',
})
void [one, said]
