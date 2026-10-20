/**
 * Versions of the variant URL, broken in turn:
 * `pnpm mutate packages/media/test/versions.mutations.ts` checks that a test
 * fails for every one.
 */
const variant = '../src/variant.ts'
const handlers = '../src/server/handlers.ts'
const tests = ['packages/media/test/versions.test.ts']

export default [
  {
    name: 'a space reads every revision as its own',
    edits: [
      {
        file: variant,
        find: 'revisionOf(spelling) === revision ||',
        replace: 'true ||',
      },
    ],
    tests,
  },
  {
    name: 'a space writes no revision',
    edits: [
      {
        file: variant,
        find: "${revision === 0 ? '' : `.r${revision}`}.${format}",
        replace: '.${format}',
      },
    ],
    tests,
  },
  {
    name: 'respelled at 0, a revision stays',
    edits: [
      {
        file: variant,
        find: "revision === 0 ? '$1' : `.r${revision}$1`",
        replace: '`.r${revision}$1`',
      },
    ],
    tests,
  },
  {
    name: 'a later revision is treated as an earlier one',
    edits: [
      {
        file: handlers,
        find: 'Variant.revisionOf(spelling) >= space.revision ||',
        replace: 'false ||',
      },
    ],
    tests,
  },
  {
    name: 'an earlier revision kept is sent away all the same',
    edits: [
      {
        file: handlers,
        find: 'onSome: ({ encoded, from }) => served(`"${key}"`, from, encoded),',
        replace: "onSome: () => refused(Answer.cases.Moved.make({ location: '/' })),",
      },
    ],
    tests,
  },
  {
    name: 'an earlier revision is sent to itself',
    edits: [
      {
        file: handlers,
        find: ".replace(':variant', current)",
        replace: ".replace(':variant', spelling)",
      },
    ],
    tests,
  },
  {
    name: 'a redirect to the current revision is not kept',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "Moved: ({ location }): Record<string, string> => ({ 'cache-control': YEAR, location }),",
        replace:
          "Moved: ({ location }): Record<string, string> => ({ 'cache-control': 'no-store', location }),",
      },
    ],
    tests,
  },
]
