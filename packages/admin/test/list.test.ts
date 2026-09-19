import { Effect, Layer, Schema, Stream } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Query, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Admin } from '../src/index.js'

const Author = Entity.define(
  'Author',
  Schema.Struct({ id: Schema.String, name: Schema.String.annotate({ title: 'Name' }) }),
)
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String.annotate({ title: 'Title' }) }),
)
const Blog = Entity.relate({ Author, Post }, { Post: { author: Relation.one(Author) } })
const Labelled = Blog.Post.pipe(Entity.annotateMembers({ author: Form.label('Written by') }))

const AuthorsQuery = Query.make('Authors', {
  Input: { search: Schema.String },
  Result: Query.connection(Blog.Author),
})

const Authors = Admin.list('Authors', {
  query: AuthorsQuery,
  selection: Entity.select(Blog.Author, { id: true, name: true }),
  pageSize: 2,
  choice: { value: row => row.id, label: row => row.name },
})

const Model = Schema.Struct({ remote: Remote.Model, search: Schema.NullOr(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  queries: [AuthorsQuery],
})

const AuthorList = Authors.at({
  data: Data,
  // Shown while there is a search; `null` means the list is not on screen.
  input: model => (model.search === null ? undefined : { search: model.search }),
})

const names = ['Ada', 'Alan', 'Annie', 'Grace']
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { id: request.id, name: names[Number(request.id.slice(1))] },
      })),
    })),
  query: request =>
    Effect.sync(() => {
      const { search } = request.input as { readonly search: string }
      const matching = names.flatMap((name, index) =>
        name.toLowerCase().startsWith(search) ? [`a${index}`] : [],
      )
      const start =
        request.window.after === undefined ? 0 : matching.indexOf(request.window.after) + 1
      const ids = matching.slice(start, start + (request.window.first ?? matching.length))
      const last = ids.at(-1)
      const more = last !== undefined && matching.indexOf(last) < matching.length - 1
      return {
        edges: ids.map(id => ({ entity: 'Author', id, key: id })),
        start: { _tag: 'Terminal' as const },
        end: more ? { _tag: 'Cursor' as const, cursor: last } : { _tag: 'Terminal' as const },
      }
    }),
  mutate: () => Effect.die('no mutations'),
  live: () => Stream.empty,
})

const initial: Model = { remote: Remote.initial, search: null }
const run = <A>(effect: Effect.Effect<A, unknown, RemoteClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(Client)))
/** What Remote's read Subscription does for the active Surface. */
const load = (model: Model) => run(Data.prefetch(model, AuthorList.active.projectionOf(model)!))
const shown = (model: Model) => {
  const page = AuthorList.page(model)
  return page._tag === 'Ready' ? page.value.items.map(row => row.name) : page._tag
}

describe('Admin.list', () => {
  it('describes a column per selected member, labelled as the form labels it', () => {
    expect(Authors.columns.map(column => [column.key, column.label])).toEqual([
      ['id', 'id'],
      ['name', 'Name'],
    ])

    const Posts = Admin.list('Posts', {
      query: Query.make('Posts', { Input: {}, Result: Query.connection(Blog.Post) }),
      selection: Entity.select(Labelled, { title: true, author: true }),
    })
    expect(Posts.columns.map(column => [column.key, column.label, column.member._tag])).toEqual([
      ['title', 'Title', 'Field'],
      ['author', 'Written by', 'Relation'],
    ])
  })

  it('requires nothing, and shows nothing, while it has no input', () => {
    expect(AuthorList.active.projectionOf(initial)).toBeUndefined()
    expect(AuthorList.page(initial)).toEqual({ _tag: 'Initial' })
    expect(AuthorList.more(initial)).toBeUndefined()
  })

  it('reads a page of rows through the Selection, and follows the input', async () => {
    const searching = await load({ ...initial, search: 'a' })
    expect(shown(searching)).toEqual(['Ada', 'Alan'])

    // Another input is another connection: nothing of the first is shown for it.
    expect(shown({ ...searching, search: 'g' })).toBe('Initial')
    expect(shown(await load({ ...searching, search: 'g' }))).toEqual(['Grace'])
  })

  it('loads the next page onto the first, and has none to load after the last', async () => {
    const first = await load({ ...initial, search: 'a' })
    const more = AuthorList.more(first)
    expect(more).toBeDefined()

    const merged = Data.reduce(first, await run(more!.effect))
    // The new rows are referenced but not read yet; the read entry fetches them.
    const second = await load(merged)
    expect(shown(second)).toEqual(['Ada', 'Alan', 'Annie'])
    expect(AuthorList.more(second)).toBeUndefined()
  })

  it('offers its loaded rows as a picker choices, read through `choice`', async () => {
    expect(AuthorList.choices({ ...initial, search: 'a' })).toEqual([])
    expect(AuthorList.choices(await load({ ...initial, search: 'a' }))).toEqual([
      { value: 'a0', label: 'Ada' },
      { value: 'a1', label: 'Alan' },
    ])
  })

  it('feeds every relation picker of a form from the list over its target', async () => {
    const EditPost = Form.make(
      'EditPost',
      Entity.input(Blog.Post, Schema.Struct({ title: Schema.String, authorId: Schema.String }), {
        authorId: Relation.input(Blog.Post.relations.author),
      }),
    )
    const options = Admin.options(EditPost, [AuthorList])

    expect(options({ ...initial, search: 'a' })).toEqual({ authorId: [] })
    expect(options(await load({ ...initial, search: 'g' }))).toEqual({
      authorId: [{ value: 'a3', label: 'Grace' }],
    })
  })

  it('reports a picker with no list over its target, and a list with no choice', () => {
    const EditPost = Form.make(
      'EditPost',
      Entity.input(Blog.Post, Schema.Struct({ authorId: Schema.String }), {
        authorId: Relation.input(Blog.Post.relations.author),
      }),
    )
    expect(() => Admin.options(EditPost, [])).toThrow(
      'Admin.options: "authorId" picks a Author, and no list given is over Author',
    )

    const Bare = Admin.list('Bare', {
      query: AuthorsQuery,
      selection: Entity.select(Blog.Author, { id: true }),
    }).at({ data: Data, input: () => ({ search: '' }) })
    expect(() => Bare.choices(initial)).toThrow('give it a "choice"')
  })
})
