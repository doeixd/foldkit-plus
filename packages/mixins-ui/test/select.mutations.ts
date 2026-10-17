/**
 * The native select's look, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/select.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = 'packages/mixins-ui/test/select.browser.test.ts'

export default [
  {
    name: 'the select draws no chevron',
    edits: [{ file: '../src/recipes/select.ts', find: '...chevron,', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the chevron stays on the right right to left',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: "Style.pseudo(':dir(rtl)', at('left')),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "the filled variant's fill wipes the chevron",
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: 'Style.self({ backgroundColor: ref.surface.field,',
        replace: 'Style.self({ background: ref.surface.field,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a chosen placeholder reads in the default ink',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: `Style.pseudo(':has(option[value=""]:checked)', { color: ref.text.muted }),`,
        replace: '',
      },
    ],
    tests: [browser],
  },
]
