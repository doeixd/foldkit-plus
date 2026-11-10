/**
 * Data routing (#236), broken in turn:
 * `pnpm mutate examples/chirp/test/site.mutations.ts`.
 */
const tests = ['examples/chirp/test/site.test.ts']

export default [
  {
    name: 'the wiring ignores the route and keeps one window',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Data.wiring(actives, { policy })',
        replace: 'Data.wiring(actives, { policy: freshness })',
      },
    ],
    tests,
  },
  {
    name: 'a profile keeps the timeline window',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Profile: () => profileFreshness',
        replace: 'Profile: () => freshness',
      },
    ],
    tests,
  },
  {
    name: 'the timeline keeps the profile window',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Home: () => freshness',
        replace: 'Home: () => profileFreshness',
      },
    ],
    tests,
  },
  {
    name: 'a status keeps the profile window',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Status: () => freshness',
        replace: 'Status: () => profileFreshness',
      },
    ],
    tests,
  },
  {
    name: 'the profile node reads no Surface',
    edits: [
      {
        file: '../src/site.ts',
        find: '  surface: { surface: Profile, params: ({ handle }) => ({ handle }) },\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the status node reads another post',
    edits: [
      {
        file: '../src/site.ts',
        find: 'params: ({ id }) => ({ id })',
        replace: "params: () => ({ id: 'p2' })",
      },
    ],
    tests,
  },
  {
    name: 'the home node reads the profile Surface too',
    edits: [
      {
        file: '../src/site.ts',
        find: 'surface: { surface: Home, params: () => undefined }',
        replace: "surface: { surface: Profile, params: () => ({ handle: 'ada' }) }",
      },
    ],
    tests,
  },
  {
    name: 'the profile node asks for another handle',
    edits: [
      {
        file: '../src/site.ts',
        find: 'params: ({ handle }) => ({ handle })',
        replace: "params: () => ({ handle: 'grace' })",
      },
    ],
    tests,
  },
]
