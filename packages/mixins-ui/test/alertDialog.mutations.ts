/**
 * The alert dialog, broken:
 * `pnpm mutate packages/mixins-ui/test/alertDialog.mutations.ts`.
 */
export default [
  {
    name: 'a dismissal is not told apart',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "message._tag === 'RequestedClose'",
        replace: 'message._tag === message._tag && false',
      },
    ],
    tests: ['packages/mixins-ui/test/alertDialog.browser.test.ts'],
  },
]
