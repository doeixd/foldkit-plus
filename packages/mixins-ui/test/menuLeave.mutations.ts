/**
 * A popup's leave ended only once it is drawn (#400), broken:
 * `pnpm mutate packages/mixins-ui/test/menuLeave.mutations.ts`.
 */
const menu = ['packages/mixins-ui/test/menubar.browser.test.ts']
const listbox = ['packages/mixins-ui/test/listbox.browser.test.ts']
const combobox = ['packages/mixins-ui/test/comboboxLeave.browser.test.ts']

export default [
  {
    name: "the menu's leave ends on a read made before the frame that draws it",
    edits: [
      {
        file: '../src/menuView.ts',
        find: '): BundleUpdateReturn<Item> => leaveDrawn(Menu.DetectMovementOrAnimationEnd, result)',
        replace: '): BundleUpdateReturn<Item> => result',
      },
    ],
    tests: menu,
  },
  {
    name: 'a leave waits for nothing before its read',
    edits: [
      {
        file: '../src/leaveDrawn.ts',
        find: 'Render.afterCommit.pipe(Effect.andThen(effect))',
        replace: 'effect',
      },
    ],
    tests: [...menu, ...listbox, ...combobox],
  },
  {
    name: "the listbox's leave ends on a read made before the frame that draws it",
    edits: [
      {
        file: '../src/listboxView.ts',
        find: '  leaveDrawn(UpstreamListbox.DetectMovementOrAnimationEnd, result)',
        replace: '  result',
      },
    ],
    tests: listbox,
  },
  {
    name: "the combobox's leave ends on a read made before the frame that draws it",
    edits: [
      {
        file: '../src/comboboxView.ts',
        find: '  leaveDrawn(UpstreamCombobox.DetectMovementOrAnimationEnd, result)',
        replace: '  result',
      },
    ],
    tests: combobox,
  },
]
