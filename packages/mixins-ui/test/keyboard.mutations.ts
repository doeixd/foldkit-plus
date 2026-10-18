/**
 * The on-screen keyboard, each part broken in turn: `pnpm mutate
 * packages/mixins-ui/test/keyboard.mutations.ts` checks that a test fails for every one.
 */
const recipes = [
  'packages/mixins-ui/test/safeArea.browser.test.ts',
  'packages/mixins-ui/test/sheet.browser.test.ts',
]
const mount = ['packages/primitives/test/keyboard-inset.browser.test.ts']

export default [
  {
    name: 'a Dialog sits centered over the keyboard',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: 'marginBottom: `calc(${ref.safe.bottom} + var(--fk-keyboard-inset, 0px))`,',
        replace: 'marginBottom: ref.safe.bottom,',
      },
    ],
    tests: recipes,
  },
  {
    name: 'a bottom sheet stays under the keyboard',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "...(side === 'bottom' ? { marginBottom: 'var(--fk-keyboard-inset, 0px)' } : {}),",
        replace: '',
      },
    ],
    tests: recipes,
  },
  {
    name: 'the inset is measured once',
    edits: [
      {
        file: '../../primitives/src/dom/keyboard-inset.ts',
        find: "          viewport.addEventListener('resize', measure)\n",
        replace: '',
      },
    ],
    tests: mount,
  },
  {
    name: 'the inset outlives the Mount',
    edits: [
      {
        file: '../../primitives/src/dom/keyboard-inset.ts',
        find: '            target.style.removeProperty(KEYBOARD_INSET)\n',
        replace: '',
      },
    ],
    tests: mount,
  },
]
