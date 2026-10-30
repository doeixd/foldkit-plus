/**
 * The prices through Remote (phase 2), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/prices.mutations.ts`.
 */
const tests = [
  'examples/foldkit/domains-plus/test/prices.test.ts',
  'examples/foldkit/domains-plus/test/server.test.ts',
]

export default [
  {
    name: 'every visit reads the names again',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 })',
        replace: 'RemotePolicy.networkOnly',
      },
    ],
    tests,
  },
  {
    name: 'Try again asks for nothing',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'model: Data.refresh(model, actives, { failed: true }),',
        replace: 'model,',
      },
    ],
    tests,
  },
  {
    name: 'a failed read with nothing to show keeps the search loading',
    edits: [
      {
        file: '../src/client/searchViewState.ts',
        find: 'return failed && !loading',
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'the server prices a name that is no label',
    edits: [
      {
        file: '../src/server/remote.ts',
        find: 'return isLabel(label) ? Option.some(label) : Option.none()',
        replace: 'return Option.some(label)',
      },
    ],
    tests,
  },
  {
    name: 'an unconfirmed name is stored without its empty quote',
    edits: [
      {
        file: '../src/server/remote.ts',
        find: `        price: null,
        renewalPrice: null,`,
        replace: '',
      },
    ],
    tests,
  },
]
