/**
 * The find and replace bar, each broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/find.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/find.ts'
const tests = ['packages/mixins-richtext/test/find.test.ts']

export default [
  {
    name: 'stepping past the last match goes nowhere',
    edits: [
      {
        file,
        find: 'count === 0 ? 0 : (((current + step) % count) + count) % count',
        replace: 'count === 0 ? 0 : Math.min(Math.max(current + step, 0), count - 1)',
      },
    ],
    tests,
  },
  {
    name: 'Shift+Enter goes forward',
    edits: [
      {
        file,
        find: 'return Option.some(input.stepped(modifiers.shiftKey ? -1 : 1))',
        replace: 'return Option.some(input.stepped(1))',
      },
    ],
    tests,
  },
  {
    name: 'Replace replaces every match',
    edits: [
      {
        file,
        find: "button('replace', 'Replace', replaced(current),",
        replace: "button('replace', 'Replace', replaced(undefined),",
      },
    ],
    tests,
  },
  {
    name: 'the bar ignores the case setting',
    edits: [
      {
        file,
        find: 'const count = RichText.findMatches(input.document, input.query, input).length',
        replace: 'const count = RichText.findMatches(input.document, input.query).length',
      },
    ],
    tests,
  },
]
