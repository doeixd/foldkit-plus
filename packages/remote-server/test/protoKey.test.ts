/**
 * Fields named like `Object.prototype`'s members, as a client asks for them:
 * read from a plain object, `constructor` and `toString` find its functions,
 * and `__proto__` the prototype.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, REMOTE_PROTOCOL_VERSION, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntitySource } from '../src/index.js'

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

describe.each(['label', '__proto__', 'constructor', 'toString'])(
  'a field named %s, withheld from the asker',
  name => {
    it('refuses a write that sets a member through the viewer from it', async () => {
      const TeamFields = Entity.define(
        'Team',
        Schema.Struct({ id: Schema.String, ...one(name, Schema.String) }),
      )
      const MemberFields = Entity.define('Member', Schema.Struct({ id: Schema.String }))
      const NoteFields = Entity.define(
        'Note',
        Schema.Struct({ id: Schema.String, mark: Schema.optional(Schema.String) }),
      )
      const {
        Team,
        Member,
        Note: Unset,
      } = Entity.relate(
        { Team: TeamFields, Member: MemberFields, Note: NoteFields },
        { Member: { team: Relation.one(TeamFields) } },
      )
      const Note = Unset.pipe(
        Entity.sets(
          {
            mark: Expr.path(
              Expr.viewer(Member),
              Expr.path(Member.relations.team, Team.fields[name]!),
            ),
          },
          { on: 'create' },
        ),
      )
      const AddNote = Mutation.write(
        'AddNote',
        Write.insert(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
      )
      const written: Array<Readonly<Record<string, unknown>>> = []
      const rows: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
        Member: { team: 'Team:t1' },
        Team: one(name, 'secret'),
      }
      const sourceOf = (entity: 'Member' | 'Team'): EntitySource<string> => ({
        entity,
        // The asker may read no field of a team but its id.
        authorize: (_, fields) => (entity === 'Team' ? fields.filter(f => f === 'id') : fields),
        read: ({ ids, fields }) =>
          Effect.succeed(
            ids.map(id => ({
              id,
              values: Object.fromEntries(
                fields.flatMap(field =>
                  Object.hasOwn(rows[entity]!, field) ? [[field, rows[entity]![field]]] : [],
                ),
              ),
            })),
          ),
      })
      const server = RemoteServer.make<string>({
        entities: [sourceOf('Member'), sourceOf('Team')],
        mutations: [
          RemoteServer.write(AddNote, {
            entity: 'Note',
            insert: ({ id, values }) => {
              written.push(values)
              return Effect.succeed({ id, ...values })
            },
            update: () => Effect.die('no updates'),
            delete: () => Effect.die('no deletes'),
          }),
        ],
        viewer: principal => Option.some(Remote.ref(Member, principal)),
      })
      const outcome = await Effect.runPromise(
        RemoteServer.handlers(server, 'ada')
          .FoldkitRemoteMutate({ requestId: 'r', mutation: 'AddNote', input: { id: 'n1' } })
          .pipe(Effect.result),
      )
      // As any withheld member: the path reaches no value, so the write is refused.
      expect(outcome).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
      expect(written).toEqual([])
    })
  },
)
