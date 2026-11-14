/**
 * The radio group's arrow pairs, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/radioGroupKeys.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/radioGroupKeys.browser.test.ts']
const file = '../src/radioGroup.ts'

export default [
  {
    name: 'the keys across the group do not move it',
    edits: [
      {
        file,
        find: "return vertical ? 'ArrowDown' : 'ArrowRight'",
        replace: "return 'ArrowDown'",
      },
    ],
    tests,
  },
  {
    name: 'the other axis is left to upstream',
    edits: [
      {
        file,
        find: "if (backward.has(read)) return vertical ? 'ArrowUp' : 'ArrowLeft'",
        replace: 'if (backward.has(read)) return key',
      },
    ],
    tests,
  },
  {
    name: 'right to left is not read',
    edits: [
      {
        file,
        find: "const read = readingKey(key, rtl ? 'rtl' : 'ltr')",
        replace: "const read = readingKey(key, 'ltr')",
      },
    ],
    tests,
  },
  {
    name: 'a vertical group is read as a row going forward',
    edits: [
      {
        file,
        find: "if (forward.has(read)) return vertical ? 'ArrowDown' : 'ArrowRight'",
        replace: "if (forward.has(read)) return 'ArrowRight'",
      },
    ],
    tests,
  },
  {
    name: 'a key not rewritten is dropped',
    edits: [{ file, find: '  return key\n}', replace: "  return ''\n}" }],
    tests,
  },
]
