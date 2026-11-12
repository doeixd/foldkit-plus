/**
 * What a save and a publish are based on, kept value included:
 * `pnpm mutate packages/cms/test/basedOn.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/editor.ts'
const tests = ['packages/cms/test/editor.test.ts']

export default [
  {
    name: 'a failed refresh holds nothing',
    edits: [
      {
        file,
        find: 'Option.flatMap(Option.fromUndefinedOr(read(root, part)), r => RemoteData.held<A>(r))',
        replace:
          "Option.flatMap(Option.fromUndefinedOr(read(root, part)), r => r._tag === 'Failed' ? Option.none() : RemoteData.held<A>(r))",
      },
    ],
    tests,
  },
  {
    name: 'a save is based on nothing',
    edits: [{ file, find: 'onSome: draft => draft.updatedAt,', replace: 'onSome: () => null,' }],
    tests,
  },
  {
    name: 'a publish is based on nothing',
    edits: [{ file, find: 'onSome: entry => entry.revision }', replace: 'onSome: () => null }' }],
    tests,
  },
]
