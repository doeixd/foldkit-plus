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
  {
    name: 'a tags input drops its name',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'h.Name(name), h.Value(tag)',
        replace: 'h.Value(tag)',
      },
    ],
    tests,
  },
  {
    name: 'a tags input submits its draft under the name',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "h.Type('text'),",
        replace: "h.Type('text'), ...(name === undefined ? [] : [h.Name(name)]),",
      },
    ],
    tests,
  },
  {
    name: 'a file input drops its name',
    edits: [
      {
        file: '../src/fileInput.ts',
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests,
  },
]
