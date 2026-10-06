/**
 * The inline shorthand guard, broken in turn: `pnpm mutate packages/mixins/test/inlineShorthand.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins/test/inlineShorthand.test.ts']
const file = '../src/styleValue.ts'

export default [
  {
    name: 'nothing is checked',
    edits: [{ file, find: '  checkInlineShorthands(style, conditions)\n', replace: '' }],
    tests,
  },
  {
    name: 'a property named like a longhand counts as one',
    edits: [{ file, find: ' &&\n  !notLonghands.test(property)', replace: '' }],
    tests,
  },
  {
    name: 'a conditional longhand of an inline shorthand passes',
    edits: [
      {
        file,
        find: 'const shorthand = shorthands.includes(property) && isLonghandOf(property, sometimes)',
        replace: 'const shorthand = false',
      },
    ],
    tests,
  },
  {
    name: 'a conditional shorthand over an inline longhand passes',
    edits: [
      {
        file,
        find: 'const longhand = shorthands.includes(sometimes) && isLonghandOf(sometimes, property)',
        replace: 'const longhand = false',
      },
    ],
    tests,
  },
]
