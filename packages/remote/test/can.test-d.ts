/** `Data.can` takes a registered mutation and only the keys its input has. */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Mutation, Remote } from './../src/index.js'

const Doc = Entity.define(
  'Doc',
  Schema.Struct({ id: Schema.String, status: Schema.Literals(['draft', 'published']) }),
)
const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id' },
  ),
)
const Other = Mutation.write(
  'Other',
  Write.update(
    Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('draft') })),
    { id: 'id' },
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Doc], mutations: [Publish] })
declare const model: Model

Data.can(model, Publish, { id: 'a' })
Data.can(model, Publish, { id: 'a', status: 'published' })

// @ts-expect-error `Other` is not registered with this domain
Data.can(model, Other, { id: 'a' })

// @ts-expect-error `title` is not a key of Publish's input
Data.can(model, Publish, { id: 'a', title: 'x' })
