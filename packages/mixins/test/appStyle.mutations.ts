/**
 * `AppStyle.make`'s page sheet built on first read, once:
 * `pnpm mutate packages/mixins/test/appStyle.mutations.ts`.
 */
const tests = ['packages/mixins/test/declared.test.ts']

export default [
  {
    name: 'the sheet is built again on every read',
    edits: [
      { file: '../src/app.ts', find: 'sheet ??= stylesheet(', replace: 'sheet = stylesheet(' },
    ],
    tests,
  },
  {
    name: 'the sheet is built when the app style is made',
    edits: [
      {
        file: '../src/app.ts',
        find: '  let sheet: string | undefined\n',
        replace: '  void [...(options.global ?? [])]\n  let sheet: string | undefined\n',
      },
    ],
    tests,
  },
]
