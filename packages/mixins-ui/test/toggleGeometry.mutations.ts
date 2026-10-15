/**
 * Toggles on the ladder, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toggleGeometry.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/toggleGeometry.browser.test.ts']
const file = '../src/recipes/toggle.ts'

export default [
  {
    name: 'an unsized toggle is a fixed 1rem',
    edits: [
      {
        file,
        find: "const edge = `var(--_fk-toggle-size, ${ladder('icon')})`",
        replace: "const edge = 'var(--_fk-toggle-size, 1rem)'",
      },
    ],
    tests,
  },
  {
    name: 'the switch track keeps the old proportion',
    edits: [
      {
        file,
        find: 'inlineSize: `calc(${rail} * 1.7)`,',
        replace: 'inlineSize: `calc(${rail} * 1.8)`,',
      },
    ],
    tests,
  },
  {
    name: 'a hovered thumb does not stretch',
    edits: [{ file, find: "hover({ '--_fk-switch-stretch': '2px' }),", replace: '' }],
    tests,
  },
  {
    name: 'an on thumb stretches past the track',
    edits: [
      {
        file,
        find: 'translate: `calc(${rail} * 0.7 - ${stretch}) 0`',
        replace: 'translate: `calc(${rail} * 0.7) 0`',
      },
    ],
    tests,
  },
]
