/**
 * What a guard set's types accept and refuse, one defect per negative case.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, Relation, type InputExpr } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import { Guards, Interaction, type PrincipalGuard, type RowGuard } from '../src/index.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
type User = typeof User.Type
const Visitor = Schema.Struct({ session: Schema.String })

const TodoFields = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, rank: Schema.Number }),
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isOwner: guard.row(TodoFields, p => {
      expectTypeOf(p.id).toEqualTypeOf<InputExpr<string>>()
      return Expr.eq(TodoFields.fields.ownerId, p.id)
    }),
  }),
  { key: user => user.id },
)

expectTypeOf(G.isAdmin).toEqualTypeOf<PrincipalGuard<User, 'Todos'>>()
expectTypeOf(G.isOwner).toEqualTypeOf<RowGuard<User, typeof TodoFields, 'Todos'>>()

Guards.declare(
  'Branching',
  User,
  guard => ({
    isOwner: guard.row(TodoFields, p =>
      // @ts-expect-error a placeholder is not a value: there is nothing to branch on
      p.role === 'admin'
        ? Expr.isNotNull(TodoFields.fields.id)
        : Expr.eq(TodoFields.fields.ownerId, p.id),
    ),
  }),
  { key: user => user.id },
)

Guards.declare(
  'Mistyped',
  User,
  guard => ({
    // @ts-expect-error a rank is a number, and the principal's id is text
    ranked: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.rank, p.id)),
  }),
  { key: user => user.id },
)

const Policy = G.implement({ isAdmin: principal => Option.isSome(principal) })

const Others = Guards.declare('Others', Visitor, guard => ({ isGuest: guard.principal() }), {
  key: visitor => visitor.session,
})

// @ts-expect-error a guard of another principal
Policy.decide(Others.isGuest, { principal: Option.none(), interaction: 'Read' })

// @ts-expect-error a body answers with a decision, not a string
G.implement({ isAdmin: () => 'yes' })

const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, authorId: Schema.String }))
const N = Guards.declare(
  'Notes',
  User,
  guard => ({ isAuthor: guard.row(Note, p => Expr.eq(Note.fields.authorId, p.id)) }),
  { key: user => user.id },
)
const Archive = Interaction.make('Archive')
const { Todo: Related } = Entity.relate(
  { Todo: TodoFields, Note },
  { Todo: { note: Relation.one(Note), notes: Relation.many(Note) } },
)

TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, Guards.all(G.isAdmin, G.isOwner)],
    },
    interactions: {
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Admins only.')),
    },
    members: { rank: { Read: Guards.on([G.isOwner], Guards.redact(0)) } },
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error `title` is not a member of Todo
    members: { title: { Read: [G.isOwner] } },
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a guard over Note's rows on a Todo surface
    row: { Read: [N.isAuthor] },
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a guard of another set
    always: [Others.isGuest],
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a rank is a number: it cannot read as 'hidden'
    members: { rank: { Read: Guards.on([G.isOwner], Guards.redact('hidden')) } },
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a hidden member is omitted or redacted, never explained
    members: { ownerId: { Read: Guards.on([G.isOwner], Guards.explain('No.')) } },
  }),
)

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a misspelled interaction
    row: { Raed: [G.isOwner] },
  }),
)

Related.pipe(Guards.attach(G, { row: { Read: [Guards.inherit('note')] } }))

Related.pipe(
  Guards.attach(G, {
    // @ts-expect-error a row inherits through a `one` relation only
    row: { Read: [Guards.inherit('notes')] },
  }),
)

Related.pipe(
  Guards.attach(G, {
    // @ts-expect-error only a Read is inherited
    row: { Update: [Guards.inherit('note')] },
  }),
)

// A named interaction beside a Read that inherits.
Related.pipe(
  Guards.attach(G, {
    row: { Read: [Guards.inherit('note')] },
    interactions: { [Archive.key]: [G.isAdmin] },
  }),
)

Related.pipe(
  Guards.attach(G, {
    // @ts-expect-error only a Read is inherited, not a named interaction
    interactions: { [Archive.key]: [Guards.inherit('note')] },
  }),
)

const Twin = Guards.declare('Twin', User, guard => ({ isAdmin: guard.principal() }), {
  key: user => user.id,
})

TodoFields.pipe(
  Guards.attach(G, {
    // @ts-expect-error a guard of another set over the same principal
    always: [Twin.isAdmin],
  }),
)
