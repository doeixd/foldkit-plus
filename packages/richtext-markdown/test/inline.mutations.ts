/**
 * The inline Markdown markers, each broken in turn: `pnpm mutate
 * packages/richtext-markdown/test/inline.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/input.ts'
const tests = [
  'packages/richtext-markdown/test/inline.test.ts',
  'packages/richtext-dom/test/editor-bundle.test.ts',
]

export default [
  {
    name: 'a marker inside a word opens',
    edits: [
      {
        file,
        find: '      (before !== undefined && !OPENS_AFTER.test(before))',
        replace: '      false',
      },
    ],
    tests,
  },
  {
    name: 'content may hold the delimiter',
    edits: [{ file, find: '      content.includes(delimiter[0]!) ||\n', replace: '' }],
    tests,
  },
  {
    name: 'content may be padded with spaces',
    edits: [{ file, find: '      content.trim() !== content ||\n', replace: '' }],
    tests,
  },
  {
    name: 'the run is counted in code units',
    edits: [
      {
        file,
        find: 'remove: graphemeCount(textBefore.slice(opening)),',
        replace: 'remove: textBefore.length - opening,',
      },
    ],
    tests,
  },
  {
    name: 'the mark carries on after the marker',
    edits: [{ file, find: '      storedMarks: [],\n', replace: '' }],
    tests,
  },
  {
    name: 'the editor ignores the marks a rule sets',
    edits: [
      {
        file: '../../richtext-dom/src/editor-bundle.ts',
        find: '((fallback ? undefined : ruled?.storedMarks) ?? storedMarks)',
        replace: 'storedMarks',
      },
    ],
    tests,
  },
]
