/**
 * The no-script pair, broken in turn:
 * `pnpm mutate packages/mixins/test/noScript.mutations.ts`.
 */
const tests = ['packages/mixins/test/declared.test.ts']
const file = '../src/utilities.ts'

export default [
  {
    name: 'a scripted control stays where no script runs',
    edits: [
      {
        file,
        find: "scriptedOnly: media(NO_SCRIPT, { display: 'none' })",
        replace: "scriptedOnly: media(NO_SCRIPT, { display: 'block' })",
      },
    ],
    tests,
  },
  {
    name: 'the stand-in is shown to a page with scripts',
    edits: [
      {
        file,
        find: "compose(self({ display: 'none' }), media(NO_SCRIPT, { display }))",
        replace: 'compose(self({ display }), media(NO_SCRIPT, { display }))',
      },
    ],
    tests,
  },
  {
    name: 'the stand-in is not shown without scripts',
    edits: [
      {
        file,
        find: 'media(NO_SCRIPT, { display }))',
        replace: "media(NO_SCRIPT, { display: 'none' }))",
      },
    ],
    tests,
  },
]
