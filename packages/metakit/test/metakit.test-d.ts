import { Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition } from 'metakit'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
})
type Account = typeof Account.Type

const Principal = Schema.Struct({
  userId: Schema.String,
  role: Schema.Literals(['owner', 'admin', 'guest']),
})
type Principal = typeof Principal.Type

// 1. Path<Env, A> is a subtype of Expr<Env, A>
const balancePath: Path.Path<Account, number> = Path.field<Account, 'balance'>('balance')
const balanceExpr: Expr.Expr<Account, number> = balancePath
void balanceExpr

// 2. Env contravariance: an Expr over { row } widens into { row, principal }
const rowOnly: Expr.Expr<{ readonly row: Account }, boolean> = Expr.in(
  { row: Account },
  ({ row }) => Num.gte(row.balance, 0),
)
const wider: Expr.Expr<{ readonly row: Account; readonly principal: Principal }, boolean> = rowOnly
void wider

// 3. Authority != validity by scope: Account invariant cannot reference principal
Account.pipe(
  Expr.refine($ =>
    // @ts-expect-error principal is not in Account's Env
    Eq.is($.principal, 'admin'),
  ),
)

// 4. Transition.set strictly requires a Path, not an arbitrary computed Expr
Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.Int }),
  apply: ({ state, input }) => [
    // @ts-expect-error computed Expr is not a Path
    Transition.set(Num.sub(state.balance, input.amount), 0),
  ],
})
