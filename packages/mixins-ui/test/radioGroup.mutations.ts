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
        find: "flexDirection: 'row',",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a chosen card stays the same colour as the rest',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: 'background: ref.accent.subtle,',
        replace: 'background: ref.surface.base,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a chosen card keeps the plain border',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: 'borderColor: ref.accent.default,',
        replace: 'borderColor: ref.outline.subtle,',
      },
    ],
    tests: browser,
  },
  {
    name: 'every card but the chosen one is marked checked',
    edits: [
      {
        file: '../src/radioGroup.ts',
        find: 'String(option.isSelected)',
        replace: 'String(!option.isSelected)',
      },
    ],
    tests: browser,
  },
]
