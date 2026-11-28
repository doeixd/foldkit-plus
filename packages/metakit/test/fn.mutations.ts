/**
 * Mutation specification for `@doeixd/metakit/fn` (`packages/metakit/src/fn.ts` & `src/prove/fn.ts`).
 */
export default [
  {
    name: 'fn: skip hygienic Rows alpha-renaming when called inside outer Arr fold or colliding user field',
    edits: [
      {
        file: '../src/fn.ts',
        find: '  const avoided = new Set(collectRootSegments(argNodes.values()))\n  if (outerEach !== Node.EACH) avoided.add(outerEach)\n  const hygienic = hasCollidingRowsBinder(node, avoided)\n    ? freshenRows(node, nextSafeDepth(avoided, node))\n    : node',
        replace:
          '  const avoided = new Set(collectRootSegments(argNodes.values()))\n  if (outerEach !== Node.EACH) avoided.add(outerEach)\n  const hygienic = node',
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
        find: '    for (const e of parts.ensuresClauses) {\n      try {',
        replace: '    for (const e of [] as typeof parts.ensuresClauses) {\n      try {',
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
  {
    name: 'fn: skip Opaque check in substituteArgs',
    edits: [
      {
        file: '../src/fn.ts',
        find: '  assertNoOpaque(node)\n  const argNodes = new Map<string, Node.Node>()',
        replace: '  void node\n  const argNodes = new Map<string, Node.Node>()',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
  {
    name: 'fn: skip expansion budget check in Fn.iterate',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    if (countNodesCapped(acc.body.node, maxNodes) > maxNodes) {',
        replace: '    if (false && countNodesCapped(acc.body.node, maxNodes) > maxNodes) {',
      },
    ],
    tests: ['packages/metakit/test/fn.test.ts'],
  },
] as const
