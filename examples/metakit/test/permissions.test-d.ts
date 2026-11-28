import { Arr, Path, Transition } from '@doeixd/metakit'
import { flagsAndNot, flagsOr, PermissionState, UserWithRoles } from '../src/permissions.js'

const $user = Path.forSchema(UserWithRoles)

// Positive: Arr.reduce over commutative monoid flagsOr compiles.
Arr.reduce($user.roles, flagsOr, each => each.bits)

// Negative: Arr.reduce over non-commutative flagsAndNot is rejected.
// @ts-expect-error flagsAndNot is not a CommutativeMonoid
Arr.reduce($user.roles, flagsAndNot, each => each.bits)

// Negative: Transition.combine with wrong field type fails on the operation.
Transition.make({
  state: UserWithRoles,
  input: PermissionState,
  apply: ({ state }) => [
    Transition.combine(
      state.id,
      // @ts-expect-error flagsOr operates on number, not string
      flagsOr,
      'x',
    ),
  ],
})
