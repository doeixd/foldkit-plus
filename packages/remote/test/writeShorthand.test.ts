/**
 * `Mutation.update`, `insert` and `delete` are the long form they stand for:
 * the same declaration, the same patch shown while pending, the same request.
 */
import { Effect, Layer, Result, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Write, type AnyWrite } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Remote,
  RemoteClient,
  type MutationDescriptor,
  type MutationRequest,
} from '../src/index.js'

const Product = Entity.define(
  'Product',
  Schema.Struct({
    // A rule of its own, which an input built from `Schema.String` would not keep.
    id: Schema.String.check(Schema.isNonEmpty()),
    name: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Int,
  }),
)
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })
const Summary = Entity.select(Product, { id: true, name: true, status: true, stock: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

const draft = { id: 'p1', name: 'Lamp', status: 'draft', stock: 0 }

// Shared by both forms, since a schema is compared by identity.
const Id = Entity.fields(Product, 'id')
const DraftStatus = Schema.Literal('draft')
const PublishedStatus = Schema.Literal('published')

const refusals = [
  { _tag: 'Conflict' },
  { _tag: 'Unmet' },
  { _tag: 'Taken', entity: 'Product', id: 'p1' },
  { _tag: 'Referenced', entity: 'Order', relation: 'product' },
  { _tag: 'Invalid', entity: 'Product', rule: 'r', message: 'm', path: [] },
]

const decodes = (schema: Schema.Codec<unknown, unknown>, value: unknown) =>
  Result.isSuccess(Schema.decodeUnknownResult(schema)(value))

/**
 * What a write mutation declares, with each schema read as what it holds or
 * accepts: two `Schema.Struct` calls over the same fields are two objects.
 */
const declaration = (
  mutation: MutationDescriptor<string, any, any, any> & { readonly write: AnyWrite },
) => {
  const { input, ...write } = mutation.write
  return {
    name: mutation.name,
    entity: input.entity,
    members: input.members,
    fields: input.schema.fields,
    Input: Object.is(mutation.Input, input.schema),
    Output: decodes(mutation.Output, {}),
    Refusal: refusals.map(refusal => decodes(mutation.Refusal, refusal)),
    write,
  }
}

/** The row shown while `mutation` is pending, and the request it sends, ids aside. */
const run = async (
  mutation: MutationDescriptor<string, any, any, any>,
  input: { readonly id: string },
) => {
  const Data = Remote.make({ model: App.model.remote, entities: [Product], mutations: [mutation] })
  const held: Model = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Product', id: 'p1', fields: ['id', 'name', 'status', 'stock'] }],
      result: { settled: [], entities: [{ entity: 'Product', id: 'p1', values: draft }] },
      now: 0,
    },
  )
  const sent: Array<typeof MutationRequest.Type> = []
  const client = Layer.succeed(RemoteClient, {
    read: () => Effect.die('no reads'),
    query: () => Effect.die('no queries'),
    mutate: request =>
      Effect.sync(() => {
        sent.push(request)
        return { output: {}, entities: [] }
      }),
    live: () => Stream.empty,
  })
  const started = Data.mutate(held, mutation, input)
  const shown = Data.get(Summary, input.id).read(started.model)
  await Effect.runPromise(started.command.effect.pipe(Effect.provide(client)))
  expect(sent).toHaveLength(1)
  const { requestId: _, operation: __, ...request } = sent[0]!
  return { shown, request }
}

describe('Mutation.update, insert and delete', () => {
  const cases = [
    {
      name: 'an insert',
      short: Mutation.insert('Add', Product, {
        set: { name: Schema.String, status: DraftStatus, stock: Schema.Int },
        becomes: Draft,
      }),
      long: Mutation.write(
        'Add',
        Write.insert(
          Entity.input(
            Product,
            Schema.Struct({ ...Id, name: Schema.String, status: DraftStatus, stock: Schema.Int }),
          ),
          { id: 'id', becomes: Draft },
        ),
      ),
      input: { id: 'p2', name: 'Desk', status: 'draft', stock: 3 },
      shows: { _tag: 'Ready', value: { id: 'p2', name: 'Desk', status: 'draft', stock: 3 } },
    },
    {
      name: 'an update with when',
      short: Mutation.update('Restock', Product, {
        set: { stock: Schema.Int },
        when: ({ input }) => Expr.lt(Product.fields.stock, input.stock),
      }),
      long: Mutation.write(
        'Restock',
        Write.update(Entity.input(Product, Schema.Struct({ ...Id, stock: Schema.Int })), {
          id: 'id',
          when: ({ input }) => Expr.lt(Product.fields.stock, input.stock),
        }),
      ),
      input: { id: 'p1', stock: 5 },
      shows: { _tag: 'Ready', value: { ...draft, stock: 5 } },
    },
    {
      name: 'an update with from and becomes',
      short: Mutation.update('Publish', Product, {
        set: { status: PublishedStatus },
        from: Draft,
        becomes: Published,
      }),
      long: Mutation.write(
        'Publish',
        Write.update(Entity.input(Product, Schema.Struct({ ...Id, status: PublishedStatus })), {
          id: 'id',
          from: Draft,
          becomes: Published,
        }),
      ),
      input: { id: 'p1', status: 'published' },
      shows: { _tag: 'Ready', value: { ...draft, status: 'published' } },
    },
    {
      name: 'a delete from a state',
      short: Mutation.delete('Drop', Product, { from: Draft }),
      long: Mutation.write(
        'Drop',
        Write.delete(Entity.input(Product, Schema.Struct(Id)), { id: 'id', from: Draft }),
      ),
      input: { id: 'p1' },
      shows: { _tag: 'NotFound' },
    },
  ] as const

  it.each(cases)('$name declares what the long form declares', ({ short, long }) => {
    expect(declaration(short)).toEqual(declaration(long))
  })

  it.each(cases)(
    '$name shows and sends what the long form does',
    async ({ short, long, input, shows }) => {
      const ran = await run(short, input)
      expect(ran).toEqual(await run(long, input))
      expect(ran.shown).toMatchObject(shows)
    },
  )

  it('names the row by the Entity’s own id field', () => {
    const Rename = Mutation.update('Rename', Product, { set: { name: Schema.String } })
    expect(Rename.write.id).toEqual({ key: 'id', field: Product.fields.id })
    expect(Rename.write.sets.map(set => set.key)).toEqual(['name'])
    expect(() => Schema.decodeUnknownSync(Rename.Input)({ name: 'Lamp' })).toThrow()
    expect(() => Schema.decodeUnknownSync(Rename.Input)({ id: '', name: 'Lamp' })).toThrow()
  })

  it('refuses where it is declared what the long form refuses', () => {
    expect(() =>
      Mutation.update('Publish', Product, {
        set: { status: Schema.Literals(['draft', 'published']) },
        from: Draft,
        becomes: Published,
      }),
    ).toThrow(/becomes Product\.Published/)
  })
})
