import { Schema } from 'effect'
import { Arr, Path, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Operation from 'metakit/operation'
import { lowering, lowerings, piece } from 'metakit/operation/sql'
import * as Relation from 'metakit/relation'

/** 31-bit non-negative permission bitmask, exact in JS, SQLite, and Postgres int4. */
export const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))

export const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
    absorbing: { value: 0x7fff_ffff, result: 0x7fff_ffff, side: 'both' },
  },
})

export const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

export const flagsAndNot = Operation.define({
  id: 'flags.andNot',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
})

export const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    monotone: ['up', 'up', 'up'],
  },
})

export const pageImplementations = Operation.implementations(
  'page',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsXor, (a, b) => a ^ b),
  Operation.implement(flagsAndNot, (a, b) => a & ~b),
  Operation.implement(flagsClamp, (x, lo, hi) => Math.min(Math.max(x, lo), hi)),
)

export const serverLowerings = lowerings(
  lowering(flagsOr, {
    sqlite: (a, b) => piece`(${a} | ${b})`,
    postgres: (a, b) => piece`(${a} | ${b})`,
    aggregate: { postgres: x => piece`bit_or(${x})` },
  }),
  lowering(flagsXor, {
    sqlite: (a, b) => piece`((${a} | ${b}) - (${a} & ${b}))`,
    postgres: (a, b) => piece`(${a} # ${b})`,
    aggregate: { postgres: x => piece`bit_xor(${x})` },
  }),
  lowering(flagsAndNot, {
    sqlite: (a, b) => piece`(${a} & ~(${b}))`,
    postgres: (a, b) => piece`(${a} & ~(${b}))`,
  }),
  lowering(flagsClamp, {
    sqlite: (x, lo, hi) => piece`MIN(MAX(${x}, ${lo}), ${hi})`,
    postgres: (x, lo, hi) => piece`LEAST(GREATEST(${x}, ${lo}), ${hi})`,
  }),
)

export const PermissionState = Schema.Struct({
  granted: Flags,
})

const BitInput = Schema.Struct({ bit: Flags })
const CapInput = Schema.Struct({ max: Flags })

export const Grant = Transition.make({
  state: PermissionState,
  input: BitInput,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsOr, input.bit)],
})

export const Toggle = Transition.make({
  state: PermissionState,
  input: BitInput,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsXor, input.bit)],
})

export const Revoke = Transition.make({
  state: PermissionState,
  input: BitInput,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsAndNot, input.bit)],
})

export const Cap = Transition.make({
  state: PermissionState,
  input: CapInput,
  apply: ({ state, input }) => [
    Transition.set(state.granted, flagsClamp(state.granted, 0, input.max)),
  ],
})

export const PermissionsMachine = Machine.make({
  state: PermissionState,
  transitions: { Grant, Toggle, Revoke, Cap },
})

export const Role = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  active: Schema.Boolean,
  bits: Schema.NullOr(Flags),
})

export const UserWithRoles = Schema.Struct({
  id: Schema.String,
  roles: Schema.Array(Role),
})

const $user = Path.forSchema(UserWithRoles)

/** Effective permission bitmask folded over all active roles in memory. */
export const effectivePermissions = Arr.reduce(
  $user.roles,
  flagsOr,
  each => each.bits,
  each => each.active,
)

export const UserRoles = Relation.make('Role.userId', Role)

const RowEnv = Schema.Struct({ row: UserWithRoles })
const $row = Path.forSchema(RowEnv)

/** Effective permission bitmask folded over related Role rows (lowers to Postgres `bit_or`). */
export const relatedEffectivePermissions = Relation.reduce(
  $row.row,
  UserRoles,
  flagsOr,
  each => each.bits,
  each => each.active,
)
