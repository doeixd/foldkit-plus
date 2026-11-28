import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Expr, Ord, Transition } from '../src/index.js'

const State = Schema.Struct({
  limit: Schema.NullOr(Schema.Int),
  count: Schema.Int,
})
const Input = Schema.Struct({ n: Schema.Int })

const t = Transition.make({
  state: State,
  input: Input,
  when: ({ state }) => Ord.gt(state.limit, 0),
  apply: ({ state, input }) => [Transition.set(state.count, input.n)],
})

expectTypeOf(t.when).toEqualTypeOf<
  Expr.Expr<
    Transition.TransitionEnv<Schema.Schema.Type<typeof State>, Schema.Schema.Type<typeof Input>>,
    boolean | null
  >
>()
