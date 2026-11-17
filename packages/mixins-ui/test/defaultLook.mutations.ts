/**
 * The default theme's look, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/defaultLook.mutations.ts` checks that a
 * test fails for every one.
 */
const chip = '../src/recipes/tagsInput.ts'
const menubar = '../src/recipes/menubar.ts'
const knobs = '../../mixins/src/theme/knobs.ts'
const tests = ['packages/mixins-ui/test/defaultLook.browser.test.ts']

export default [
  {
    name: 'a tag chip reads the recessed muted surface again',
    edits: [
      {
        file: chip,
        find: '    background: ref.surface.default,',
        replace: '    background: ref.surface.muted,',
      },
    ],
    tests,
  },
  {
    name: 'a tag chip takes the large corner again, not a pill',
    edits: [
      {
        file: chip,
        find: '    borderRadius: ref.radius.full,\n    // A step',
        replace: '    borderRadius: ref.radius.xl,\n    // A step',
      },
    ],
    tests,
  },
  {
    name: 'the Menubar bar reads the recessed muted surface again',
    edits: [
      {
        file: menubar,
        find: '        background: ref.surface.default,',
        replace: '        background: ref.surface.muted,',
      },
    ],
    tests,
  },
  {
    name: 'the dark accent fill is light again, under near-black words',
    edits: [
      {
        file: knobs,
        find: "        variable: 'accent-l-dark',\n        default: 54,",
        replace: "        variable: 'accent-l-dark',\n        default: 70,",
      },
    ],
    tests,
  },
  {
    name: 'the light accent fill is back at 55, where its words read 4.4996',
    edits: [
      {
        file: knobs,
        find: "        variable: 'accent-l',\n        default: 54,",
        replace: "        variable: 'accent-l',\n        default: 55,",
      },
    ],
    tests: ['packages/mixins-ui/test/popupContrast.browser.test.ts'],
  },
]
