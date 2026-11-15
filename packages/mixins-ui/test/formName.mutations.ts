/**
 * What a form control submits, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/formName.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/formName.ssr.test.ts']

export default [
  {
    name: 'a rating ignores its name',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.Name(options.name ?? options.id)',
        replace: 'h.Name(options.id)',
      },
    ],
    tests,
  },
  {
    name: 'a slider drops its name',
    edits: [
      {
        file: '../src/slider.ts',
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests,
  },
]
