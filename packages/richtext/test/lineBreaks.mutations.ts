/**
 * Enter in a `lineBreaks` kind, each step broken in turn: `pnpm mutate
 * packages/richtext/test/lineBreaks.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/lineBreaks.test.ts']

export default [
  {
    name: 'a declared kind still splits',
    edits: [
      {
        file,
        find: "holder !== undefined && definition?.kind === 'node' && definition.lineBreaks === true",
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'an empty last line cannot be left',
    edits: [{ file, find: 'return onEmptyLastLine', replace: 'return false' }],
    tests,
  },
  {
    name: 'any empty line leaves',
    edits: [
      {
        file,
        find: '        last?.id === at.id &&\n        caret.offset === at.text.length &&\n',
        replace: '',
      },
    ],
    tests,
  },
]
