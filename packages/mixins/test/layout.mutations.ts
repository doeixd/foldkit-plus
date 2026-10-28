/**
 * The stack's child rule and the center's width, broken: `pnpm mutate packages/mixins/test/layout.mutations.ts`.
 */
const file = '../src/layout.ts'
const tests = ['packages/mixins/test/layout.browser.test.ts']

export default [
  {
    name: 'the stack sizes every child to its width, over a width the child sets',
    edits: [
      {
        file,
        find: "{ alignSelf: 'stretch', marginBlock: '0' }",
        replace: "{ inlineSize: '100%', marginBlock: '0' }",
      },
    ],
    tests,
  },
  {
    name: 'the stack leaves its children their own width',
    edits: [
      { file, find: "{ alignSelf: 'stretch', marginBlock: '0' }", replace: "{ marginBlock: '0' }" },
    ],
    tests,
  },
  {
    name: 'a center shrinks to its content in a stack',
    edits: [
      {
        file,
        find: "inlineSize: '100%',\n      marginInline: 'auto',",
        replace: "marginInline: 'auto',",
      },
    ],
    tests,
  },
]
