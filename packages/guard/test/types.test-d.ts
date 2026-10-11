/**
 * What a guard set's types accept and refuse, one defect per negative case.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, type InputExpr } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import { Guards, type PrincipalGuard, type RowGuard } from '../src/index.js'

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

expectTypeOf(G.isAdmin).toEqualTypeOf<PrincipalGuard<User>>()
expectTypeOf(G.isOwner).toEqualTypeOf<RowGuard<User, typeof TodoFields>>()

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
