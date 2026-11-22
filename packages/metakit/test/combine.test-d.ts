import { Schema } from 'effect'
import { Transition } from '../src/index.js'
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
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsClamp = Operation.define({
  id: 'flags.clamp',
  version: 1,
  args: [Flags, Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: { monotone: ['up', 'up', 'up'] },
})

const State = Schema.Struct({ granted: Flags, label: Schema.String })
const Input = Schema.Struct({ bit: Flags, text: Schema.String })

// Positive: binary operation matching target type compiles.
const ok = Transition.make({
  state: State,
  input: Input,
  apply: ({ state, input }) => [Transition.combine(state.granted, flagsOr, input.bit)],
})
void ok

// Negative: operation whose type differs from target path fails on the operation argument.
Transition.make({
  state: State,
  input: Input,
  apply: ({ state, input }) => [
    Transition.combine(
      state.label,
      // @ts-expect-error flagsOr operates on number, not string
      flagsOr,
      input.text,
    ),
  ],
})

// Negative: ternary operation is rejected by BinaryOver.
Transition.make({
  state: State,
  input: Input,
  apply: ({ state, input }) => [
    Transition.combine(
      state.granted,
      // @ts-expect-error flagsClamp takes 3 arguments, not 2
      flagsClamp,
      input.bit,
    ),
  ],
})
