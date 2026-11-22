/**
 * Three asks of the kernel, broken in turn: `Transition.commutes` reading
 * negation, `Transition.step` taking foreign implementations, and a total
 * refused past the safe range:
 *   `pnpm mutate packages/metakit/test/kernel-asks.mutations.ts`
 */
const commutes = '../src/transitionCommutes.ts'
const transition = '../src/transition.ts'
const machine = '../src/machine.ts'
const aggregates = '../src/aggregates.ts'

const tests = ['packages/metakit/test/kernel-asks.test.ts']

const mutation = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'commutes: a negated amount is not an integer the checker reads',
    commutes,
    "node.op.id === 'num.neg'",
    "node.op.id === 'num.negated'",
  ),
  mutation(
    'commutes: a negated amount keeps the interval of the amount',
    commutes,
    ': Option.map(integerOf(transition, operand), Interval.neg)',
    ': integerOf(transition, operand)',
  ),
  mutation(
    'step: a written value is evaluated with no foreign implementations',
    transition,
    'const value = evalNode(node, env, options?.foreign)',
    'const value = evalNode(node, env)',
  ),
  mutation(
    'step: a guard is evaluated with no foreign implementations',
    transition,
    'if (evalNode(transition.when.node, env, options?.foreign) !== true)',
    'if (evalNode(transition.when.node, env) !== true)',
  ),
  mutation(
    'run: the options are dropped before the step',
    transition,
    'Result.map(step(transition, state, input, ...args), s => s.state)',
    'Result.map(step(transition, state, input, args[0] as never), s => s.state)',
  ),
  mutation(
    'dispatch: the options are not given to the step',
    machine,
    "          'supplied' in message ? message.supplied : {},\n          options,\n",
    "          'supplied' in message ? message.supplied : {},\n",
  ),
  mutation(
    'update: the options are not given to dispatch',
    machine,
    'const res = dispatch(state, message, options)',
    'const res = dispatch(state, message)',
  ),
  mutation(
    'aggregate: the total past the range is refused only above',
    aggregates,
    'if (total > SAFE_TOTAL || total < -SAFE_TOTAL) {',
    'if (total > SAFE_TOTAL) {',
  ),
  mutation(
    'aggregate: evaluate over rows does not check its total',
    aggregates,
    '      withinSafe(\n        fold,\n        rows.reduce((acc, row) => acc + BigInt(valueOf(row)), BigInt(zero)),\n      ) as A,',
    '      Number(rows.reduce((acc, row) => acc + BigInt(valueOf(row)), BigInt(zero))) as A,',
  ),
  mutation(
    'aggregate: a delta takes the total past the range unchecked',
    aggregates,
    'apply: (total, delta) => withinSafe(fold, BigInt(total) + BigInt(delta)) as A,',
    'apply: (total, delta) => (total + delta) as A,',
  ),
]
