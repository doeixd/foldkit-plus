/**
 * Part binding, broken in turn: `pnpm mutate packages/agent/test/parts.mutations.ts`.
 */
const file = '../src/parts.ts'
const tests = ['packages/agent/test/parts.test.ts']

export default [
  {
    name: 'unavailable capabilities stay listed',
    edits: [
      {
        file,
        find: 'const offered = yield* runtime.messages.available',
        replace: 'const offered = yield* runtime.messages.list',
      },
    ],
    tests,
  },
  {
    name: 'a shared label selects the first rendering',
    edits: [
      { file, find: 'if (candidates.length > 1) {', replace: 'if (candidates.length > 100) {' },
    ],
    tests,
  },
  {
    name: 'a part shows every encoded field',
    edits: [
      {
        file,
        find: '  for (const field of fields) {\n    if (Object.hasOwn(encoded, field)) out[field] = (encoded as Record<string, unknown>)[field]\n  }',
        replace:
          '  for (const field of Object.getOwnPropertyNames(encoded)) {\n    out[field] = (encoded as Record<string, unknown>)[field]\n  }',
      },
    ],
    tests,
  },
  {
    name: 'an unknown part id dispatches that name',
    edits: [
      {
        file,
        find: 'if (part === undefined) return Effect.fail(UnknownPartError.of(id))',
        replace:
          'if (part === undefined) return runtime.messages.dispatchUnknown(id, input, invocation)',
      },
    ],
    tests,
  },
  {
    name: 'a stale occurrence matches the part off-page',
    edits: [
      {
        file,
        find: 'if (occurrence !== undefined) return hits.length === 0 ? undefined : hits',
        replace:
          'if (occurrence !== undefined) return hits.length === 0 ? [{ part, occurrence: Option.none() }] : hits',
      },
    ],
    tests,
  },
  {
    name: 'a lookup with no name succeeds',
    edits: [
      {
        file,
        find: "return yield* Effect.die(new Error('Discovery names a part id or a label'))",
        replace: 'return UiDiscovery.None()',
      },
    ],
    tests,
  },
]
