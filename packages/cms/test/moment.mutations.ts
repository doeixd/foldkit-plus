/**
 * A Moment keeps one formatter per locale (#306), each cache dropped in turn:
 * `pnpm mutate packages/cms/test/moment.mutations.ts`.
 */
const tests = ['packages/cms/test/kinds.test.ts']

export default [
  {
    name: 'a formatter of the date and time made for every value',
    edits: [{ file: '../src/kinds.ts', find: '  absolutes.set(locale, made)\n', replace: '' }],
    tests,
  },
  {
    name: 'a relative formatter made for every value',
    edits: [{ file: '../src/kinds.ts', find: '  relatives.set(locale, made)\n', replace: '' }],
    tests,
  },
]
