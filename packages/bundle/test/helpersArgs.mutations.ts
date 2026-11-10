/**
 * Helpers that read their args, broken in turn:
 * `pnpm mutate packages/bundle/test/helpersArgs.mutations.ts`.
 */
const tests = ['packages/bundle/test/helpersArgs.test.ts']

export default [
  {
    name: 'a placement calls them with no args',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'readsArgs(bundle.helpers) ? needArgs() : undefined',
        replace: 'undefined',
      },
    ],
    tests,
  },
  {
    name: 'a collection calls them with no args',
    edits: [
      {
        file: '../src/collection.ts',
        find: 'readsArgs(bundle.helpers) ? needArgs() : undefined',
        replace: 'undefined',
      },
    ],
    tests,
  },
  {
    name: 'a preset keeps the function instead of binding it',
    edits: [
      {
        file: '../src/bundle.ts',
        find: '{ helpers: helpersFor(spec.helpers, args) }',
        replace: '{ helpers: spec.helpers }',
      },
    ],
    tests,
  },
  {
    name: 'withHelpers spreads the function away',
    edits: [
      {
        file: '../src/combinators.ts',
        find: 'helpers: readsArgs(self.helpers)',
        replace: 'helpers: false',
      },
    ],
    tests,
  },
  {
    name: 'helpersOf reads them with no args',
    edits: [
      {
        file: '../src/bundle.ts',
        find: "): BundleParts<B>['Helpers'] => helpersFor(bundle.helpers, args)",
        replace: "): BundleParts<B>['Helpers'] => helpersFor(bundle.helpers, undefined)",
      },
    ],
    tests,
  },
]
