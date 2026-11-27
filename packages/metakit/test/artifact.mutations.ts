/**
 * `metakit/artifact` guards broken in turn:
 * `pnpm mutate packages/metakit/test/artifact.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/metakit/test/artifact.test.ts']

export default [
  {
    name: 'encodeExpr allows Opaque nodes instead of failing',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `        Opaque: ({ name }) =>
          Effect.fail(
            new UnsupportedNodeError({
              nodeTag: 'Opaque',
              detail: \`opaque node "\${name}" cannot be serialized as a portable artifact\`,
            }),
          ),`,
        replace: `        Opaque: () => Effect.succeed({ _tag: 'Lit' as const, value: null }),`,
      },
    ],
    tests,
  },
  {
    name: 'registry ignores conflicting duplicate operations',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `        if (existing !== undefined && !compatibleOps(existing, op)) {
          return Effect.fail(`,
        replace: `        if (false && existing !== undefined && !compatibleOps(existing, op)) {
          return Effect.fail(`,
      },
    ],
    tests,
  },
  {
    name: 'decode skips allowlist check for foreign operations',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `      if (foreignAllow !== undefined && !foreignAllow.has(key)) {
        return Effect.fail(`,
        replace: `      if (false && foreignAllow !== undefined && !foreignAllow.has(key)) {
        return Effect.fail(`,
      },
    ],
    tests,
  },
  {
    name: 'decode skips arity validation on core operators',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `                    const expectedArity = coreArity[id]
                    if (args.length !== expectedArity) {`,
        replace: `                    const expectedArity = coreArity[id]
                    if (false && args.length !== expectedArity) {`,
      },
    ],
    tests,
  },
  {
    name: 'decode skips result type compatibility check',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `    const inferredKind = inferNodeKind(decodedNode)
    if (!kindCompatible(inferredKind, options.result.ast)) {`,
        replace: `    const inferredKind = inferNodeKind(decodedNode)
    if (false && !kindCompatible(inferredKind, options.result.ast)) {`,
      },
    ],
    tests,
  },
  {
    name: 'decode skips path scope validation',
    edits: [
      {
        file: '../src/artifact.ts',
        find: `            const resolved = resolveRootSegment(segments)
            if (Option.isNone(resolved)) {`,
        replace: `            const resolved = resolveRootSegment(segments)
            if (false && Option.isNone(resolved)) {`,
      },
    ],
    tests,
  },
]
