/**
 * A Menu's leave ended only once it is drawn (#400), broken:
 * `pnpm mutate packages/mixins-ui/test/menuLeave.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/menubar.browser.test.ts']

export default [
  {
    name: 'the leave ends on a read made before the frame that draws it',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '): BundleUpdateReturn<Item> => leaveDrawn(result)',
        replace: '): BundleUpdateReturn<Item> => result',
      },
    ],
    tests,
  },
  {
    name: 'the leave waits for nothing before its read',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'Render.afterCommit.pipe(Effect.andThen(effect))',
        replace: 'effect',
      },
    ],
    tests,
  },
]
