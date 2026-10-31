/**
 * A prerendered page served for a query (#373), broken in turn: `pnpm mutate
 * packages/ssr/test/prerendered.mutations.ts` checks that a test fails for
 * each.
 */
const client = '../src/client.ts'
const index = '../src/index.ts'
const shared = '../src/shared.ts'
const tests = [
  'packages/ssr/test/entry.test.ts',
  'packages/ssr/test/prerenderedResume.test.ts',
  'packages/ssr/test/prerenderedRefused.test.ts',
  'packages/ssr/test/prerenderedTyped.test.ts',
  'packages/ssr/test/generatedResume.test.ts',
  'packages/ssr/test/entryResume.test.ts',
]

export default [
  {
    name: 'a prerendered path records its query too',
    edits: [
      {
        file: index,
        find: "    return !route.includes('?') && prerendered.has(pathKey(route)) ? 'path' : 'full'",
        replace: "    return 'full'",
      },
    ],
    tests,
  },
  {
    name: 'a prerendered path with a query records its path alone',
    edits: [
      {
        file: index,
        find: "    return !route.includes('?') && prerendered.has(pathKey(route)) ? 'path' : 'full'",
        replace: "    return prerendered.has(pathKey(route)) ? 'path' : 'full'",
      },
    ],
    tests,
  },
  {
    name: 'prerendered paths are compared as written',
    edits: [
      {
        file: index,
        find: '  const prerendered = new Set((options.prerendered ?? []).map(pathKey))',
        replace: '  const prerendered = new Set(options.prerendered ?? [])',
      },
    ],
    tests,
  },
  {
    name: 'the application is never told the URL',
    edits: [
      {
        file: shared,
        find: "  if (routing === undefined || new URL(href).search === '') return Option.none()",
        replace: '  return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a page recorded with its query is told the URL too',
    edits: [
      {
        file: shared,
        find: "read.success.match !== 'path'",
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a page at another query waits for its start',
    edits: [
      {
        file: client,
        find: "  const start = Option.isSome(arrived) ? 'now' : plan.start",
        replace: '  const start = plan.start',
      },
    ],
    tests,
  },
  {
    name: 'the runtime starts from the served Model, the URL left out',
    edits: [
      {
        file: client,
        find: 'startingFrom({ ...config, update }, startOf())',
        replace: 'startingFrom({ ...config, update }, { model, commands })',
      },
    ],
    tests,
  },
  {
    name: 'the refusal of a page at another query says nothing of prerendering',
    edits: [
      {
        file: shared,
        find: "        match !== 'path' && pathKey(String(route)) === pathKey(options.route)",
        replace: '        false',
      },
    ],
    tests,
  },
]
