import { Schema } from 'effect'
import * as Language from '../src/language.js'
import * as Num from '../src/ops/num.js'
import * as Operation from '../src/operation.js'
import * as Transition from '../src/transition.js'

const Mask = Schema.Int

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Mask, Mask] as const,
  returns: Mask,
  nulls: 'strict',
})

const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Mask, Mask] as const,
  returns: Mask,
  nulls: 'strict',
})

const Permissions = Language.make({
  flags: {
    or: flagsOr,
    xor: flagsXor,
  },
})

// Positive: implement with all operations compiles cleanly.
Permissions.implement('server', {
  flags: {
    or: (a, b) => a | b,
    xor: (a, b) => a ^ b,
  },
})

// Negative: implement missing flags.xor must fail to compile.
Permissions.implement('broken', {
  // @ts-expect-error Property 'xor' is missing
  flags: {
    or: (a, b) => a | b,
  },
})

// Positive: expression mixing Num and language.families.flags infers its environment and flows into Transition.set.
const State = Schema.Struct({ mask: Mask })
export const Grant = Transition.make({
  state: State,
  input: Schema.Struct({ bit: Mask }),
  when: () => true,
  apply: ({ state, input }) => [
    Transition.set(state.mask, Permissions.families.flags.or(state.mask, Num.add(input.bit, 0))),
  ],
})
