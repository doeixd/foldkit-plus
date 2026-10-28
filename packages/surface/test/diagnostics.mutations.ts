/**
 * The diagnostics channel, broken in turn:
 * `pnpm mutate packages/surface/test/diagnostics.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/surface/test/diagnostics.test.ts']
const file = '../src/diagnostics.ts'

export default [
  {
    name: 'every level logs as a warning',
    edits: [
      {
        file,
        find: "(diagnostic.level === 'error' ? Effect.logError : Effect.logWarning)",
        replace: 'Effect.logWarning',
      },
    ],
    tests,
  },
  {
    name: 'the log does not name the package',
    edits: [
      {
        file,
        find: '`[${diagnostic.source}] ${diagnostic.message}`,',
        replace: 'diagnostic.message,',
      },
    ],
    tests,
  },
  {
    name: 'the reporter in the context is ignored',
    edits: [
      {
        file,
        find: 'Effect.flatMap(Effect.service(Reporter), report => report(diagnostic))',
        replace: 'log(diagnostic)',
      },
    ],
    tests,
  },
  {
    name: 'a broken reporter fails the caller',
    edits: [
      { file, find: '      Effect.catchCause(cause =>', replace: '      Effect.tapCause(cause =>' },
    ],
    tests,
  },
  {
    name: 'a broken reporter is logged below a warning',
    edits: [{ file, find: '        Effect.logError(', replace: '        Effect.log(' }],
    tests,
  },
  {
    name: 'collect keeps nothing',
    edits: [{ file, find: '          reported.push(diagnostic)', replace: '' }],
    tests,
  },
]
