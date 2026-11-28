const tests = ['packages/ssr/test/staticRegion.test.ts']

export default [
  {
    name: 'checkStaticRegion skips hasHandlers refusal',
    edits: [
      {
        file: '../src/static.ts',
        find: 'if (options.hasHandlers === true) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checkStaticRegion skips deadReaders refusal',
    edits: [
      {
        file: '../src/static.ts',
        find: 'if (!options.live.deadReaders.includes(options.readerId)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checkStaticRegion skips unbounded live set refusal',
    edits: [
      {
        file: '../src/static.ts',
        find: 'if (options.live.unbounded) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checkStaticRegion skips opaque reads refusal',
    edits: [
      {
        file: '../src/static.ts',
        find: 'if (Option.isNone(options.bindings.reads)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checkStaticRegion skips live.writes overlap refusal',
    edits: [
      {
        file: '../src/static.ts',
        find: 'if (overlapping !== undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checkStaticRegion skips isUnchangingPath filter on omittedPaths',
    edits: [
      {
        file: '../src/static.ts',
        find: 'isUnchangingPath(path, options.live)',
        replace: 'true',
      },
    ],
    tests,
  },
]
