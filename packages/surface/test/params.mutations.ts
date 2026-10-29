/**
 * The runtime refusal of a Surface read without its params, broken in turn:
 * `pnpm mutate packages/surface/test/params.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/surface/test/params.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'a Surface missing its params is not refused',
    edits: [
      {
        file,
        find: '        throw new Error(`Surface "${name}" declares params, and was given none`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a params schema that accepts undefined is not consulted',
    edits: [
      { file, find: '        !Schema.is(config.Params)(undefined)', replace: '        true' },
    ],
    tests,
  },
  {
    name: 'a Surface without params is treated as one with them',
    edits: [{ file, find: '        config.Params !== undefined &&', replace: '' }],
    tests,
  },
]
