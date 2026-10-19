/**
 * The theme code's tokenizer, broken in turn:
 * `pnpm mutate examples/site/test/tsTokens.mutations.ts`.
 */
const unit = ['examples/site/test/tsTokens.test.ts']
const file = '../src/view/tsTokens.ts'

export default [
  {
    name: 'a keyword reads as a word',
    edits: [{ file, find: 'KEYWORDS.has(word)', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a call reads as a word',
    edits: [{ file, find: "next === '('", replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a type reads as a word',
    edits: [{ file, find: '/^[A-Z]/.test(word)', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'an escaped quote ends its string',
    edits: [{ file, find: "/('(?:[^'\\\\]|\\\\.)*'", replace: "/('[^']*'" }],
    tests: unit,
  },
]
