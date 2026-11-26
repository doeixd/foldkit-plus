/**
 * Mutation specification for `metakit/fn` (`packages/metakit/src/fn.ts` & `src/prove/fn.ts`).
 */
export default [
  {
    name: 'fn: skip hygienic Rows alpha-renaming when called inside outer Arr fold',
    edits: [
      {
        file: '../src/fn.ts',
        find: '  const prepared =\n    outerEach === Node.EACH\n      ? node\n      : freshenRows(node, Number(outerEach.slice(Node.EACH.length + 1)) || 1)',
        replace: '  const prepared = node',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
  {
    name: 'fn: skip returnSchema check in runChecked',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    if (Option.isSome(checkReturn) && !checkReturn.value(result)) {',
        replace: '    if (false && Option.isSome(checkReturn) && !checkReturn.value(result)) {',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
  {
    name: 'fn: skip ensures check in runChecked',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    for (const e of parts.ensuresClauses) {',
        replace: '    for (const e of [] as typeof parts.ensuresClauses) {',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
  {
    name: 'prove/fn: drop well-definedness goal',
    edits: [
      {
        file: '../src/prove/fn.ts',
        find: '  const goals: Array<Node.Node> = [definedGoal]',
        replace: '  const goals: Array<Node.Node> = []',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
] as const
