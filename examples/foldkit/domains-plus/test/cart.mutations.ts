/**
 * The cart (phase 5), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/cart.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/cart.test.ts']

export default [
  {
    name: 'a domain added twice is in the cart twice',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'Array.some(model.cart, ({ name }) => name === domain.name)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'removing from the cart leaves focus on a button that is gone',
    edits: [
      { file: '../src/client/app.ts', find: 'commands: [FocusCartCloseButton()],', replace: '' },
    ],
    tests,
  },
  {
    name: 'closing the cart leaves focus where it was',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'sheetMessageStep(model, message, cartSheet, FocusCartButton)',
        replace: 'sheetMessageStep(model, message, cartSheet, FocusSearchInput)',
      },
    ],
    tests,
  },
  {
    name: 'a taken name can be added',
    edits: [
      {
        file: '../src/client/view.ts',
        find: `          [formatRegistrationPrice(available)],
        ),
        cartToggle(added, available, slots, h),`,
        replace: `          [formatRegistrationPrice(available)],
        ),`,
      },
    ],
    tests,
  },
  {
    name: 'focus goes back while the dialog is still closing',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'const closed = isSheetDialogMessage(message) && isCompletedCloseDialog(message.message)',
        replace: 'const closed = isSheetDialogMessage(message)',
      },
    ],
    tests,
  },
]
