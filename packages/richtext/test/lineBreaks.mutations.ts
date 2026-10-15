/**
 * Enter in a `lineBreaks` kind, each step broken in turn: `pnpm mutate
 * packages/richtext/test/lineBreaks.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/lineBreaks.test.ts', 'packages/richtext/test/indent.test.ts']

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
  {
    name: 'every kind with line breaks is indented',
    edits: [
      {
        file,
        find: "return definition?.kind === 'node' && definition.indents === true ? block : undefined",
        replace:
          "return definition?.kind === 'node' && definition.lineBreaks === true ? block : undefined",
      },
    ],
    tests,
  },
  {
    name: 'a broken line never keeps its indentation',
    edits: [
      {
        file,
        find: '                definition.indents === true\n',
        replace: '                false\n',
      },
    ],
    tests,
  },
  {
    name: 'every broken line keeps its indentation',
    edits: [
      {
        file,
        find: '                definition.indents === true\n',
        replace: '                true\n',
      },
    ],
    tests,
  },
]
