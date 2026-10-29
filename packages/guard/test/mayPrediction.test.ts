/**
 * `may` foreseen by the client for a row it writes, from the rules it shares
 * with the server: decided where it comes out the same however the parts the
 * client cannot know (a principal guard, the principal's fields, a row or
 * field it lacks) turn out, and not foreseen otherwise. operations-phase5-DESIGN §3.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write, type AnyWrite } from 'foldkit-entity'
import { predictionOfWrite, type EntityStore } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Guards, MaySchema, type MayAnswer } from '../src/index.js'

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String })),
  Post: Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String })),
}
const Related = Entity.relate(Fields, { Post: { author: Relation.one(Fields.User) } })
const Principal = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
const G = Guards.declare(
  'Blog',
  Principal,
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(Related.Post, () =>
      Expr.eq(Related.Post.relations.author, Expr.viewer(Related.User)),
    ),
    isMember: guard.row(Related.Post, p => Expr.eq(p.role, 'member')),
  }),
  { key: user => user.id, unguarded: 'deny', viewer: Related.User },
)
const Authored = Related.Post.pipe(
  Entity.sets({ author: Expr.viewer(Related.User) }, { on: 'create' }),
)

/** Its author or an admin may change it: an admin is the server's to say. */
const Post = Authored.pipe(
  Guards.attach(G, { row: { Write: [G.isAuthor, G.isAdmin] } }),
  Guards.may,
)
/** Only its author may change it, and a refusal says why; a member may delete it. */
const Strict = Authored.pipe(
  Guards.attach(G, {
    row: {
      Update: Guards.on([G.isAuthor], Guards.explain('Only its author may edit it.')),
      Delete: [G.isMember],
    },
  }),
  Guards.may,
)
const OnlyAuthor = Authored.pipe(Guards.attach(G, { row: { Write: [G.isAuthor] } }), Guards.may)

const NewPost = Schema.Struct({ id: Schema.String, body: Schema.String })
const Edit = Schema.Struct({ id: Schema.String, body: Schema.String })

/** A post the store holds, written by `author`, or with no author held. */
const holding = (author: string | null): EntityStore => ({
  'Post:p2': {
    values: { id: 'p2', body: 'theirs', ...(author === null ? {} : { author: `User:${author}` }) },
    present: new Set(['id', 'body', ...(author === null ? [] : ['author'])]),
    stale: new Set(),
    unavailable: new Set(),
    tombstone: false,
    updatedAt: 0,
    windows: {},
  },
})

/** What the client shows for the row's `may` before the answer: none where it shows none. */
const foreseen = (
  write: AnyWrite,
  input: unknown,
  store: EntityStore,
  viewer: Option.Option<string>,
): Option.Option<MayAnswer> =>
  Option.fromUndefinedOr(
    predictionOfWrite(write, input, undefined, {
      derived: new Map(),
      store,
      viewer: Option.map(viewer, id => ({ entity: 'User', id })),
      now: Option.some(1),
    }).flatMap(patch =>
      '_tag' in patch || !Object.hasOwn(patch.values, 'may')
        ? []
        : [Schema.decodeUnknownSync(MaySchema)(patch.values.may)],
    )[0],
  )

const answer = (row: Readonly<Record<string, boolean>>, reasons = {}): MayAnswer => ({
  row,
  reasons,
  members: {},
  relations: {},
})
const ada = Option.some('ada')

describe('may, foreseen for a row the client writes', () => {
  it('is everything for a post you make, whatever the server says of admins', () => {
    const create = Write.insert(Entity.input(Post, NewPost), { id: 'id' })
    expect(foreseen(create, { id: 'p1', body: 'mine' }, {}, ada)).toEqual(
      Option.some(answer({ Update: true, Delete: true })),
    )
  })

  it('is not foreseen where a principal guard the client cannot ask decides it', () => {
    const edit = Write.update(Entity.input(Post, Edit), { id: 'id' })
    expect(foreseen(edit, { id: 'p2', body: 'mine now' }, holding('bo'), ada)).toEqual(
      Option.none(),
    )
  })

  it('is refused, with its sentence, where no unknown part could allow it', () => {
    const edit = Write.update(Entity.input(OnlyAuthor, Edit), { id: 'id' })
    expect(foreseen(edit, { id: 'p2', body: 'x' }, holding('bo'), ada)).toEqual(
      Option.some(answer({ Update: false, Delete: false })),
    )
    const strict = Write.update(Entity.input(Strict, Edit), { id: 'id' })
    const why = 'Only its author may edit it.'
    // Deleting is a member's: the principal's role is the server's to know.
    expect(foreseen(strict, { id: 'p2', body: 'x' }, holding('bo'), ada)).toEqual(Option.none())
    const unRoled = Authored.pipe(
      Guards.attach(G, {
        row: {
          Update: Guards.on([G.isAuthor], Guards.explain(why)),
          Delete: [G.isAuthor],
        },
      }),
      Guards.may,
    )
    const edit2 = Write.update(Entity.input(unRoled, Edit), { id: 'id' })
    expect(foreseen(edit2, { id: 'p2', body: 'x' }, holding('bo'), ada)).toEqual(
      Option.some(answer({ Update: false, Delete: false }, { Update: why })),
    )
  })

  it('is not foreseen from the principal’s fields where the client names no viewer', () => {
    // A client told no viewer may be signed in all the same: a member may delete.
    const MembersDelete = Authored.pipe(
      Guards.attach(G, { row: { Update: [G.isAuthor], Delete: [G.isMember] } }),
      Guards.may,
    )
    const edit = Write.update(Entity.input(MembersDelete, Edit), { id: 'id' })
    expect(foreseen(edit, { id: 'p2', body: 'x' }, holding('bo'), Option.none())).toEqual(
      Option.none(),
    )
  })

  it("is not foreseen over a row whose author the store lacks, and a visitor's is refused", () => {
    const edit = Write.update(Entity.input(OnlyAuthor, Edit), { id: 'id' })
    expect(foreseen(edit, { id: 'p2', body: 'x' }, holding(null), ada)).toEqual(Option.none())
    expect(foreseen(edit, { id: 'p2', body: 'x' }, holding('bo'), Option.none())).toEqual(
      Option.some(answer({ Update: false, Delete: false })),
    )
  })
})
