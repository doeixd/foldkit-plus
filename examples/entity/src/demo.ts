/**
 * One domain declaration read from both ends. `domain.ts` declares Entities and
 * Selections with `foldkit-entity` alone. Here the client turns them into
 * Remote descriptors and Projections; `server.ts` binds the same Entities to
 * SQLite tables. The demo joins the two in process and traces a Surface from
 * plan to decoded value.
 */
import { Effect, Layer, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Remote, RemoteData, Selection } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { AuthorPage, Blog, PostPage } from './domain.js'
import { Server, openDatabase } from './server.js'

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })

const App = Surface.application({
  Model,
  Message,
  initial: { remote: Remote.initial },
  update: (model, message): { readonly model: Model } => ({ model: Data.reduce(model, message) }),
})

// The client's interpretation: each Entity as a Remote descriptor. It never
// sees a table; relations arrive as refs and the store follows them.
const Data = Remote.make({
  model: App.model.remote,
  entities: [Entity.from(Blog.Author), Entity.from(Blog.Post), Entity.from(Blog.Comment)],
})

const PostSurface = App.surface('PostPage', {
  params: { postId: Schema.String },
  model: ({ params }) => ({ post: Data.get(Selection.from(PostPage), params.postId) }),
})

const AuthorSurface = App.surface('AuthorPage', {
  params: { authorId: Schema.String },
  model: ({ params }) => ({ author: Data.get(Selection.from(AuthorPage), params.authorId) }),
})

const describe = <Value>(data: RemoteData<Value>): string =>
  RemoteData.match(data, {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: value => `Ready ${JSON.stringify(value)}`,
    Refreshing: value => `Refreshing ${JSON.stringify(value)}`,
    Failed: error => `Failed ${error._tag}`,
    NotFound: () => 'NotFound',
  })

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const database = openDatabase()
  // In process: the server's handlers are the client's transport, and the
  // database is what those handlers need.
  const client = Remote.clientLayer(RemoteServer.handlers(Server, null)).pipe(
    Layer.provide(database.layer),
  )
  try {
    const post = PostSurface.projection({ postId: 'p1' })
    const [plan] = Data.plan(App.initial, post)
    lines.push(`plan: ${plan?.entity}:${plan?.id} [${plan?.fields.join(',')}]`)
    lines.push(`plan follows: ${Object.keys(plan?.relations ?? {}).join(',')}`)
    lines.push(`before fetch: ${describe(post.read(App.initial).post)}`)

    const loaded = await Effect.runPromise(
      Data.prefetch(App.initial, post).pipe(Effect.provide(client)),
    )
    const read = post.read(loaded).post
    lines.push(`after fetch: ${describe(read)}`)
    // The value the client assembled satisfies the schema the domain declared.
    lines.push(
      `matches the domain's Selection: ${read._tag === 'Ready' && Schema.is(PostPage.schema)(read.value)}`,
    )

    // A second Surface walks the same graph from the other side. Ada's name came
    // in as the post's author, so only her posts are planned.
    const author = AuthorSurface.projection({ authorId: 'a1' })
    lines.push(
      `second plan: ${Data.plan(loaded, author)
        .map(entry => `${entry.entity}:${entry.id} [${entry.fields.join(',')}]`)
        .join(', ')}`,
    )
    const both = await Effect.runPromise(Data.prefetch(loaded, author).pipe(Effect.provide(client)))
    lines.push(`author: ${describe(author.read(both).author)}`)
  } finally {
    database.close()
  }
  return lines
}
