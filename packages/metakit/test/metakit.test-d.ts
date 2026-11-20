import { Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'

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

// 5. Eq.is and Eq.oneOf constrain right-hand literals by the left-hand type (no widening!)
Expr.in({ row: Account }, ({ row }) =>
  Expr.all(
    Eq.is(row.status, 'open'),
    // @ts-expect-error 'typo' is not assignable to 'open' | 'frozen'
    Eq.is(row.status, 'typo'),
    // @ts-expect-error 'typo' is not assignable to 'open' | 'frozen'
    Eq.oneOf(row.status, ['open', 'typo']),
  ),
)

// 6. Heterogeneous Env intersection in Expr.all without annotations
const principalOnly = Expr.in({ principal: Principal }, ({ principal }) =>
  Eq.is(principal.role, 'admin'),
)
const combined: Expr.Expr<{ readonly row: Account } & { readonly principal: Principal }, boolean> =
  Expr.all(rowOnly, principalOnly)
void combined

// 7. Exact literal-union return type from Expr.match (not widened to string)
const statusLabel: Expr.Expr<{ readonly row: Account }, 'Active' | 'Locked'> = Expr.in(
  { row: Account },
  ({ row }) =>
    Expr.match(row.status, {
      open: 'Active',
      frozen: 'Locked',
    }),
)
void statusLabel

// 8. Path.of<Interface>() works on TypeScript interfaces with zero repeated keys
interface AppModel {
  readonly account: Account
  readonly theme: 'light' | 'dark'
}
const appBalance: Path.Path<AppModel, number> = Path.of<AppModel>().account.balance
const appTheme: Path.Path<AppModel, 'light' | 'dark'> = Path.of<AppModel>().theme
void appBalance
void appTheme

// 9. Prove.machine constrains `pin` and `allowUnknown` keys to the Machine's transition names
const AccountMachine = Machine.make({
  state: Account,
  transitions: {
    Deposit: Transition.make({
      state: Account,
      input: Schema.Struct({ amount: Schema.Int }),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, input.amount)),
      ],
    }),
  },
})

void Prove.machine(AccountMachine, {
  pin: ['Deposit'],
  allowUnknown: { Deposit: 'demo' },
})

void Prove.machine(AccountMachine, {
  // @ts-expect-error 'Typo' is not a transition name on AccountMachine
  pin: ['Typo'],
})

void Prove.machine(AccountMachine, {
  // @ts-expect-error 'Typo' is not a transition name on AccountMachine
  allowUnknown: { Typo: 'unknown transition' },
})
