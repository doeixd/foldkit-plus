/**
 * A request's context, broken in turn:
 * `pnpm mutate packages/ssr/test/requestContext.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/requestContext.ts'
const tests = ['packages/ssr/test/requestContext.test.ts']

export default [
  {
    name: 'each copy of the module keeps its own values',
    edits: [
      {
        file,
        find: "const KEY = Symbol.for('foldkit-ssr/request-context')",
        replace: "const KEY = Symbol('foldkit-ssr/request-context')",
      },
    ],
    tests,
  },
  {
    name: 'a second value replaces the first',
    edits: [{ file, find: '    if (held.has(name))\n', replace: '    if (false)\n' }],
    tests,
  },
  {
    name: 'a context reads a value attached under another name',
    edits: [
      {
        file,
        find: 'held !== undefined && held.has(name)',
        replace: 'held !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'whatever globalThis holds is taken for the map',
    edits: [{ file, find: '  if (!(held instanceof WeakMap))\n', replace: '  if (false)\n' }],
    tests,
  },
]
