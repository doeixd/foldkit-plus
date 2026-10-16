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
  {
    name: 'no checked box shows its check',
    edits: [
      {
        file,
        find: "Style.pseudo(`${checked}::after`, { clipPath: 'inset(0 0 0 0)' }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'every unchecked box shows a check',
    edits: [
      { file, find: "clipPath: 'inset(0 100% 100% 0)'", replace: "clipPath: 'inset(0 0 0 0)'" },
    ],
    tests,
  },
  {
    name: 'the check wipes in under reduced motion too',
    edits: [
      {
        file,
        find: 'transitionDuration: travelled(ref.motion.fast)',
        replace: 'transitionDuration: ref.motion.fast',
      },
    ],
    tests,
  },
  {
    name: 'a mixed box keeps the check mark box',
    edits: [
      {
        file,
        find: "inlineSize: 'auto',\n        blockSize: 'auto',\n        border: '0',\n        rotate: 'none',",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a mixed box keeps the check clipped away',
    edits: [
      {
        file,
        find: "rotate: 'none',\n        clipPath: 'inset(0 0 0 0)',",
        replace: "rotate: 'none',",
      },
    ],
    tests,
  },
]
