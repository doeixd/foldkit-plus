/**
 * Fields named like `Object.prototype`'s members, as a client asks for them:
 * read from a plain object, `constructor` and `toString` find its functions,
 * and `__proto__` the prototype.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Relation } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const one = <A>(name: string, value: A): Record<string, A> => Object.fromEntries([[name, value]])

describe.each(['__proto__', 'constructor', 'toString'])('a list named %s', name => {
  it('is served whole by the memory backend beside a list read with a window', async () => {
    const CommentBase = Entity.define('Comment', Schema.Struct({ id: Schema.String }))
    const PostBase = Entity.define('Post', Schema.Struct({ id: Schema.String }))
    const Blog = Entity.relate(
      { Comment: CommentBase, Post: PostBase },
      {
        Post: { comments: Relation.many(CommentBase), ...one(name, Relation.many(CommentBase)) },
      },
    )
    const Data = Remote.make({ model: App.model.remote, entities: [Blog.Comment, Blog.Post] })
    const refs = ['Comment:c1', 'Comment:c2']
    const backend = RemoteServer.memory({
      domain: Data,
      rows: {
        Post: [{ id: 'a', comments: refs, ...one(name, refs) }],
        Comment: [{ id: 'c1' }, { id: 'c2' }],
      },
    })

    const answer = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [
            {
              entity: 'Post',
              id: 'a',
              fields: ['comments', name],
              windows: { comments: { first: 1 } },
            },
          ],
        })
      }).pipe(Effect.provide(backend.layer)),
    )

    expect(Object.getOwnPropertyDescriptor(answer.entities[0]?.values, name)?.value).toEqual(refs)
  })
})
