/**
 * The Dialog and its alert role, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/dialog.mutations.ts`.
 */
const unit = 'packages/mixins-ui/test/dialog.test.ts'
const browser = 'packages/mixins-ui/test/dialog.browser.test.ts'

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
    tests: [browser],
  },
  {
    name: 'an alert dialog draws no role',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "[...render.dialog, context.h.Role('alertdialog')]",
        replace: 'render.dialog',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every dialog is an alert dialog',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "context.role === 'alertdialog'",
        replace: 'true',
      },
    ],
    tests: [unit],
  },
]
