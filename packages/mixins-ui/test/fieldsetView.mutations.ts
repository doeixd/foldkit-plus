/**
 * `Fieldset.view`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fieldsetView.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/fieldset.test.ts']
const file = '../src/fieldset.ts'

export default [
  {
    name: 'the legend is not drawn',
    edits: [
      { file, find: 'h.legend(legend, [options.legend]),', replace: 'h.legend(legend, []),' },
    ],
    tests,
  },
  {
    name: 'the content is dropped',
    edits: [{ file, find: '...options.content,', replace: '' }],
    tests,
  },
  {
    name: 'a description is not linked',
    edits: [
      {
        file,
        find: 'hasDescription: options.description !== undefined,',
        replace: 'hasDescription: false,',
      },
    ],
    tests,
  },
  {
    name: 'the description is not drawn',
    edits: [{ file, find: ': [h.p(description, [options.description])]),', replace: ': []),' }],
    tests,
  },
  {
    name: 'a disabled fieldset is not disabled',
    edits: [{ file, find: '{ isDisabled: options.disabled }', replace: '{}' }],
    tests,
  },
]
