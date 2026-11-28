const tests = ['packages/metakit/test/k11-numeric-reads.test.ts']

export default [
  {
    name: 'concrete path reads keep negative zero',
    edits: [
      {
        file: '../src/ops/eval.ts',
        find: 'return current === undefined ? null : normalizeRead(current)',
        replace: 'return current === undefined ? null : current',
      },
    ],
    tests,
  },
  {
    name: 'known partial path reads keep negative zero',
    edits: [
      {
        file: '../src/ops/partial.ts',
        find: 'Option.some(normalizeRead(current))',
        replace: 'Option.some(current)',
      },
    ],
    tests,
  },
  {
    name: 'only integer operands trigger the safe result check',
    edits: [
      {
        file: '../src/ops/num.ts',
        find: 'Number.isInteger(result) && !Number.isSafeInteger(result)',
        replace: 'args.every(Number.isSafeInteger) && !Number.isSafeInteger(result)',
      },
    ],
    tests,
  },
  {
    name: 'the prover refuses an unsafe Float64 result only of integer operands',
    edits: [
      {
        file: '../src/prove/lower.ts',
        find: 'z3.And(unsafeFp(result), fpInteger(result)),',
        replace: 'z3.And(unsafeFp(result), fpInteger(x), fpInteger(y)),',
      },
    ],
    tests: ['packages/metakit/test/phase1-gate.test.ts'],
  },
]
