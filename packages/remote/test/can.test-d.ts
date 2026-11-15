/** `Data.can` takes a registered mutation and only the keys its input has. */
import { Option, Schema } from 'effect'
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

// `Data.capability` types `toInput`'s return by the write's input, and returns checks over the Model.
const checks = Data.capability(Publish, ({ input }: { input: { readonly id: string } }) => ({
  id: input.id,
}))
const allowed: boolean | { readonly allowed: false; readonly reason: string } = checks.authorize({
  model,
  input: { id: 'a' },
  principal: undefined,
})
void allowed
// @ts-expect-error the checks are asked over this domain's Model
checks.applies({ model: {}, input: { id: 'a' }, principal: undefined })

// @ts-expect-error Publish's status is `published`
Data.capability(Publish, ({ input }: { input: { readonly id: string } }) => ({
  id: input.id,
  status: 'draft' as const,
}))

// @ts-expect-error `Other` is not registered with this domain
Data.capability(Other, () => ({ id: 'a' }))

Data.available(Publish, () => Option.some({ id: 'a' }))
// @ts-expect-error `Other` is not registered with this domain
Data.available(Other, () => Option.some({ id: 'a' }))

// Spread into a consumer that types its hooks by its own input, as `Agent.expose` does.
declare const variant: <Ext>(config: {
  readonly input: Schema.Codec<Ext, any>
  readonly authorize?: (request: { input: Ext; model: Model; principal: unknown }) => unknown
  readonly applies?: (request: { input: Ext; model: Model; principal: unknown }) => unknown
}) => void
variant({
  input: Schema.Struct({ id: Schema.String }),
  ...Data.capability(Publish, ({ input }: { input: { readonly id: string } }) => ({
    id: input.id,
    status: 'published',
  })),
})
// A literal the write's input asks for is kept, the call's input typed by the request's annotation.
Data.capability(Publish, () => ({ status: 'published' }))
Data.available(Publish, () => Option.some({ id: 'a', status: 'published' }))
