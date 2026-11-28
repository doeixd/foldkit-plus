const tests = ['packages/metakit/test/checker-partial-reads.test.ts']

export default [
  {
    name: 'a membership assumed logs no drop',
    edits: [
      {
        file: '../src/abstract/ops.ts',
        find: "      // What is kept is the range of the candidates, not the membership itself.\n      state.drop('unsupported', 'eq.among')\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a term unequal to itself is not a contradiction',
    edits: [
      {
        file: '../src/abstract/ops.ts',
        find: "    if (Node.key(args[0]!) === Node.key(args[1]!)) state.markBottom()\n    else state.drop('unsupported', 'eq.isNot')",
        replace: "    state.drop('unsupported', 'eq.isNot')",
      },
    ],
    tests,
  },
  {
    name: 'a literal assumed twice is compared by reference',
    edits: [
      {
        file: '../src/abstract/ops.ts',
        find: 'state.eqFacts.has(pk) && Node.apply(Eq.isOp, [state.eqFacts.get(pk), literal]) !== true',
        replace: 'state.eqFacts.has(pk) && state.eqFacts.get(pk) !== literal',
      },
    ],
    tests,
  },
  {
    name: 'a step is checked as though its write could lie under a null field',
    edits: [
      {
        file: '../src/abstract/check.ts',
        find: '    ...parentsPresent,\n',
        replace: '',
      },
    ],
    tests,
  },
]
