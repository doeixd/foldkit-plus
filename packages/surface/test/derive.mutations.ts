/**
 * `Projection.derive`: `pnpm mutate packages/surface/test/derive.mutations.ts`.
 */
const tests = ['packages/surface/test/derive.test.ts', 'packages/mixins/test/region.test.ts']

export default [
  {
    name: 'a derivation is worked out on every read',
    edits: [{ file: '../src/index.ts', find: 'before === undefined\n', replace: 'true\n' }],
    tests,
  },
  {
    name: 'a derivation giving the same fields hands out the new value',
    edits: [
      {
        file: '../src/index.ts',
        find: ': keepAlike(before.value, derive(root))',
        replace: ': derive(root)',
      },
    ],
    tests,
  },
  {
    name: "a Projection's paths are not read",
    edits: [
      {
        file: '../src/index.ts',
        find: 'RefTypeId in entry ? [entry[RefTypeId].dependency] : entry.dependencies,',
        replace: 'RefTypeId in entry ? [entry[RefTypeId].dependency] : []',
      },
    ],
    // A region module defines its regions on load, and fails to load: an
    // invalid run, not a kill, so the derivation's own test alone.
    tests: ['packages/surface/test/derive.test.ts'],
  },
  {
    name: 'a derivation from nothing is made',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (paths.length === 0 || paths.some(declared => declared.length === 0)) {',
        replace: 'if (paths.some(declared => declared.length === 0)) {',
      },
    ],
    tests,
  },
  {
    name: 'a derivation over a read that declares no path is made',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (paths.length === 0 || paths.some(declared => declared.length === 0)) {',
        replace: 'if (paths.length === 0) {',
      },
    ],
    tests,
  },
]
