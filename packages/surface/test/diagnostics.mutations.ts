/**
 * The diagnostics channel, broken in turn:
 * `pnpm mutate packages/surface/test/diagnostics.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/surface/test/diagnostics.test.ts']
const file = '../src/diagnostics.ts'
// The page Behaviors.consoleErrors watches is built from this module too.
const pageTests = [...tests, 'packages/plus/test/playwright.test.ts']

export default [
  {
    name: 'every level logs as a warning',
    edits: [
      {
        file,
        find: "diagnostic.level === 'error' ? logError(text) : Effect.logWarning(text)",
        replace: 'Effect.logWarning(text)',
      },
    ],
    tests,
  },
  {
    name: 'an error is written with console.log (#272)',
    edits: [{ file, find: 'Logger.LogToStderr, true)', replace: 'Logger.LogToStderr, false)' }],
    tests: pageTests,
  },
  {
    name: 'a warning is written with console.error too',
    edits: [
      {
        file,
        find: ': Effect.logWarning(text)',
        replace: ': Effect.provideService(Effect.logWarning(text), Logger.LogToStderr, true)',
      },
    ],
    tests: pageTests,
  },
  {
    name: 'a broken reporter is written with console.log',
    edits: [{ file, find: '        logError(', replace: '        Effect.logError(' }],
    tests,
  },
  {
    name: 'the log does not name the package',
    edits: [
      {
        file,
        find: 'const text = `[${diagnostic.source}] ${diagnostic.message}`',
        replace: 'const text = diagnostic.message',
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
    edits: [{ file, find: '        logError(', replace: '        Effect.log(' }],
    tests,
  },
  {
    name: 'collect keeps nothing',
    edits: [{ file, find: '          reported.push(diagnostic)', replace: '' }],
    tests,
  },
]
