/**
 * The hover guard in the stylesheet, broken in turn: `pnpm mutate
 * packages/mixins-ui/test/hoverGuard.mutations.ts` checks that a test fails for every one.
 */
const file = '../../mixins/src/styleRules.ts'
const tests = [
  'packages/mixins-ui/test/hoverGuard.browser.test.ts',
  'packages/mixins-ui/test/hoverGuard.touch.browser.test.ts',
  'packages/mixins/test/styleRules.test.ts',
]

export default [
  {
    name: 'a hover rule is drawn where nothing hovers',
    edits: [{ file, find: "[{ media: '@media (hover: hover)', text:", replace: '[{ text:' }],
    tests,
  },
  {
    name: 'a hover selector has no touch copy',
    edits: [
      { file, find: '.filter(selector => !needsHover(selector))', replace: '.filter(() => false)' },
    ],
    tests,
  },
  {
    name: 'the recipes’ hover is no pressed state',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: ', Style.pseudo(PRESSED, held(declarations)))',
        replace: ')',
      },
    ],
    tests,
  },
  {
    name: 'the touch copy still hovers',
    edits: [
      {
        file,
        find: "const UNHOVERABLE = ':not(:hover, :not(:hover))'",
        replace: "const UNHOVERABLE = ':hover'",
      },
    ],
    tests,
  },
]
