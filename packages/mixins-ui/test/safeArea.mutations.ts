/**
 * Safe areas, each use broken in turn: `pnpm mutate
 * packages/mixins-ui/test/safeArea.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/safeArea.browser.test.ts']

export default [
  {
    name: 'a toast stack sits over the home indicator',
    edits: [
      {
        file: '../src/recipes/toast.ts',
        find: 'bottom: `calc(${ref.space.lg} + ${ref.safe.bottom})`,',
        replace: 'bottom: ref.space.lg,',
      },
    ],
    tests,
  },
  {
    name: 'a toast stack sits under the notch at its side',
    edits: [
      {
        file: '../src/recipes/toast.ts',
        find: 'inline: `calc(${ref.space.lg} + max(${ref.safe.left}, ${ref.safe.right}))`,',
        replace: 'inline: `calc(${ref.space.lg} + ${ref.safe.right})`,',
      },
    ],
    tests,
  },
  {
    name: 'a full Dialog runs under the notch',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: '        marginLeft: ref.safe.left,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a full Dialog is as tall as the screen less its margin alone',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: 'block: `100% - 2rem - ${ref.safe.top} - ${ref.safe.bottom} - var(--fk-keyboard-inset, 0px)`,',
        replace: "block: '100% - 2rem - var(--fk-keyboard-inset, 0px)',",
      },
    ],
    tests,
  },
]
