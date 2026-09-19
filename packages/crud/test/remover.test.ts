import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Query, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String.annotate({ title: 'Title' }) }),
)
const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })
const DeletePost = Mutation.make('DeletePost', {
  Input: { postId: Schema.String },
  Output: {},
})

const Remover = Crud.remover('PostRemover', {
  mutation: DeletePost,
  // The mutation calls it `postId`; the remover only knows an id.
  input: id => ({ postId: id }),
})
const Slot = Bundle.declare(Remover.bundle, 'remover')

const Model = Schema.Struct({
  remote: Remote.Model,
  shown: Schema.NullOr(Schema.String),
  ...Slot.fields,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  AskedToDelete: { id: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  queries: [PostsQuery],
  mutations: [DeletePost],
})
const PostRemover = Remover.at({ data: Data, model: App.model.remover })
const Posts = Crud.list('Posts', {
  query: PostsQuery,
  selection: Entity.select(Post, { id: true, title: true }),
}).at({ data: Data, input: () => ({}) })
const PostDetail = Crud.detail('PostDetail', {
  selection: Entity.select(Post, { title: true }),
}).at({ data: Data, id: model => model.shown ?? undefined })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostRemover.onOut })
const placements = Page.assemble(Placed)
const update = placements.update((model: Model, message: Message) =>
  message._tag === 'AskedToDelete'
    ? Placed.helpers.ask(message.id)(model)
    : Remote.reduces(message)
      ? { model: Data.reduce(model, message) }
      : { model },
)

const server = { posts: new Map<string, string>() }
let failing = false
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      entities: batch.requests.flatMap(request => {
        const title = server.posts.get(request.id)
        return title === undefined
          ? []
          : [{ entity: 'Post', id: request.id, values: { id: request.id, title } }]
      }),
    })),
  query: () =>
    Effect.sync(() => ({
      edges: [...server.posts.keys()].map(id => ({ entity: 'Post', id, key: id })),
      start: { _tag: 'Terminal' as const },
      end: { _tag: 'Terminal' as const },
    })),
  mutate: request =>
    failing
      ? Effect.fail({ _tag: 'RemoteMutationError', message: 'not allowed' } as never)
      : Effect.sync(() => {
          const { postId } = request.input as { readonly postId: string }
          server.posts.delete(postId)
          // The server says what is gone; it names no connection.
          return { output: {}, entities: [], deleted: [{ entity: 'Post', id: postId }] }
        }),
  live: () => Stream.empty,
})

const run = <A>(effect: Effect.Effect<A, unknown, RemoteClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Client)))
const dispatch = async (model: Model, message: Message): Promise<Model> => {
  const next = update(model, message)
  let current = next.model
  for (const command of next.commands ?? [])
    current = await dispatch(current, (await run(command.effect)) as Message)
  return current
}
const remover = (model: Model, message: typeof Remover.Message.Type) =>
  dispatch(model, Message.GotRemoverMessage({ message }))
const titles = (model: Model) => {
  const page = Posts.page(model)
  return page._tag === 'Ready' ? page.value.items.map(row => row.title) : page._tag
}

const start = async (): Promise<Model> => {
  const initial = placements.initial({ remote: Remote.initial, shown: null }).model
  return run(Data.prefetch(initial, Posts.active.projectionOf(initial)!))
}

beforeEach(() => {
  failing = false
  server.posts = new Map([
    ['p1', 'First'],
    ['p2', 'Second'],
  ])
})

describe('Crud.remover', () => {
  it('asks first: nothing is deleted until the yes', async () => {
    const listed = await start()
    expect(PostRemover.status(listed)).toBe('Idle')

    const asked = await dispatch(listed, Message.AskedToDelete({ id: 'p1' }))
    expect(PostRemover.status(asked)).toBe('Confirming')
    expect(PostRemover.target(asked)).toBe('p1')
    expect(server.posts.has('p1')).toBe(true)

    const cancelled = await remover(asked, Remover.Message.Cancelled())
    expect(PostRemover.status(cancelled)).toBe('Idle')
    expect(server.posts.has('p1')).toBe(true)
  })

  it('deletes on the yes, and the row leaves the list with no refetch', async () => {
    const asked = await dispatch(await start(), Message.AskedToDelete({ id: 'p1' }))
    const started = update(
      asked,
      Message.GotRemoverMessage({ message: Remover.Message.Confirmed() }),
    )
    expect(PostRemover.status(started.model)).toBe('Deleting')

    const deleted = await remover(asked, Remover.Message.Confirmed())
    expect(PostRemover.status(deleted)).toBe('Deleted')
    expect(server.posts.has('p1')).toBe(false)
    expect(titles(deleted)).toEqual(['Second'])
  })

  it('makes a page showing the deleted one read NotFound', async () => {
    const showing = await run(
      Data.prefetch(
        { ...(await start()), shown: 'p1' },
        PostDetail.active.projectionOf({ ...(await start()), shown: 'p1' })!,
      ),
    )
    expect(PostDetail.value(showing)).toEqual({ _tag: 'Ready', value: { title: 'First' } })

    const asked = await dispatch(showing, Message.AskedToDelete({ id: 'p1' }))
    const deleted = await remover(asked, Remover.Message.Confirmed())
    expect(PostDetail.value(deleted)).toEqual({ _tag: 'NotFound' })
  })

  it('reports a failed delete, says why, and keeps the row', async () => {
    const asked = await dispatch(await start(), Message.AskedToDelete({ id: 'p1' }))
    failing = true
    const failed = await remover(asked, Remover.Message.Confirmed())

    expect(PostRemover.status(failed)).toBe('DeleteFailed')
    expect(PostRemover.error(failed)).toMatchObject({ message: 'not allowed' })
    expect(titles(failed)).toEqual(['First', 'Second'])
  })

  it('ignores a yes with nothing asked, and dismisses after it is done', async () => {
    const listed = await start()
    const stray = update(
      listed,
      Message.GotRemoverMessage({ message: Remover.Message.Confirmed() }),
    )
    expect(stray.commands ?? []).toEqual([])
    expect(server.posts.size).toBe(2)

    const deleted = await remover(
      await dispatch(listed, Message.AskedToDelete({ id: 'p2' })),
      Remover.Message.Confirmed(),
    )
    expect(PostRemover.status(Placed.helpers.dismiss()(deleted).model)).toBe('Idle')
  })
})

describe('Crud.detail', () => {
  it('describes a line per selected member, and reads nothing while no id is shown', async () => {
    const listed = await start()
    expect(
      Crud.detail('D', { selection: Entity.select(Post, { id: true, title: true }) }).fields.map(
        field => [field.key, field.label],
      ),
    ).toEqual([
      ['id', 'id'],
      ['title', 'Title'],
    ])
    expect(PostDetail.active.projectionOf(listed)).toBeUndefined()
    expect(PostDetail.value(listed)).toEqual({ _tag: 'Initial' })
  })
})
