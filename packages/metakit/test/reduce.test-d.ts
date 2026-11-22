import { Schema } from 'effect'
import { Arr, Path, type Expr } from '../src/index.js'
import * as Operation from '../src/operation.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsAndNot = Operation.define({
  id: 'flags.andNot',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
})

const maybeAssoc = Operation.define({
  id: 'flags.maybeAssoc',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: { unlessRefused: true },
    identity: { value: 0, side: 'both' },
  },
})

const State = Schema.Struct({
  roles: Schema.Array(Schema.Struct({ bits: Flags, active: Schema.Boolean })),
})
const $ = Path.forSchema(State)

// Positive: commutative monoid compiles and returns Expr<State, number>.
const ok: Expr.Expr<typeof State.Type, number> = Arr.reduce($.roles, flagsOr, each => each.bits)
void ok

// Negative: non-commutative-monoid operation is rejected at compile time.
// @ts-expect-error flagsAndNot lacks commutative, associative, identity claims
Arr.reduce($.roles, flagsAndNot, each => each.bits)

// Negative: associative unlessRefused is not a total CommutativeMonoid.
// @ts-expect-error unlessRefused associativity is not accepted by Arr.reduce
Arr.reduce($.roles, maybeAssoc, each => each.bits)
