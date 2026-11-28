const mutation = (name: string, find: string) => ({
  name,
  edits: [{ file: '../src/prove/lower.ts', find, replace: '' }],
  tests: ['packages/metakit/test/phase1-gate.test.ts'],
})

export default [
  mutation(
    'Float64 arithmetic accepts unsafe operands',
    '            unsafeFp(x),\n            unsafeFp(y),\n',
  ),
  mutation(
    'Float64 arithmetic accepts an unsafe integer result',
    '            z3.And(unsafeFp(result), fpInteger(result)),\n',
  ),
]
