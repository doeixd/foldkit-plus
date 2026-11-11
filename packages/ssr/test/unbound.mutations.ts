/**
 * `SSR.unbound`, broken: `pnpm mutate packages/ssr/test/unbound.mutations.ts`.
 */
const tests = ['packages/ssr/test/unbound.test.ts']

export default [
  {
    name: 'a handler passes as if it bound nothing',
    edits: [
      {
        file: '../src/shared.ts',
        find: "if (attribute._tag.startsWith('On')) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: "a Submodel's attribute passes",
    edits: [
      { file: '../src/shared.ts', find: "if (!('_tag' in attribute)) {", replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'every attribute is refused',
    edits: [{ file: '../src/shared.ts', find: "attribute._tag.startsWith('On')", replace: 'true' }],
    tests,
  },
]
