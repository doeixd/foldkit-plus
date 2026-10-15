/**
 * The radio group's layout, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/radioGroup.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/radioGroup.browser.test.ts']

export default [
  {
    name: 'a vertical group lays its options in a row',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: "Style.self({ display: 'flex', flexDirection: 'column', gap: ref.space['2xs'] }),",
        replace: "Style.self({ display: 'flex', gap: ref.space['2xs'] }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a horizontal group stacks its options',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: "      Style.states({ horizontal: { flexDirection: 'row' } }, 'aria-orientation'),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
]
