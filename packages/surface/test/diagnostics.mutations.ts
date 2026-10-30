/**
 * The diagnostics channel, broken in turn:
 * `pnpm mutate packages/surface/test/diagnostics.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/surface/test/diagnostics.test.ts']
const file = '../src/diagnostics.ts'
// The page Behaviors.consoleErrors watches is built from this module too.
const pageTests = [...tests, 'packages/plus/test/playwright.test.ts']
const documentTests = [
  'packages/surface/test/diagnosticsDocument.test.ts',
  'packages/mixins/test/mountRuntime.test.ts',
]

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
    edits: [{ file, find: '      logError(', replace: '      Effect.logError(' }],
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
        find: 'Effect.flatMap(Effect.service(Reporter), reporter => reporter(diagnostic))',
        replace: 'log(diagnostic)',
      },
    ],
    tests,
  },
  {
    name: 'a broken reporter fails the caller',
    edits: [
      { file, find: '    Effect.catchCause(cause =>', replace: '    Effect.tapCause(cause =>' },
    ],
    tests,
  },
  {
    name: 'a broken reporter is logged below a warning',
    edits: [{ file, find: '      logError(', replace: '      Effect.log(' }],
    tests,
  },
  {
    name: 'collect keeps nothing',
    edits: [{ file, find: '          reported.push(diagnostic)', replace: '' }],
    tests,
  },
  {
    name: 'quiet logs warnings too',
    edits: [
      {
        file,
        find: "diagnostic.level === 'error' ? log(diagnostic) : Effect.void",
        replace: 'log(diagnostic)',
      },
    ],
    tests: tests,
  },
  {
    name: 'quiet drops errors too',
    edits: [
      {
        file,
        find: "diagnostic.level === 'error' ? log(diagnostic) : Effect.void",
        replace: 'Effect.void',
      },
    ],
    tests: tests,
  },
  {
    name: "a detached element's event reaches nobody",
    edits: [
      { file, find: 'element.isConnected ? element : element.ownerDocument', replace: 'element' },
    ],
    tests: documentTests,
  },
  {
    name: 'any event of the name is claimed',
    edits: [
      {
        file,
        find: '!(event instanceof DiagnosticEvent) ||',
        replace: '!(event instanceof Event) ||',
      },
    ],
    tests: documentTests,
  },
  {
    name: 'a second layer claims an event already claimed',
    edits: [{ file, find: ' || event.defaultPrevented) return', replace: ') return' }],
    tests: documentTests,
  },
  {
    name: 'a claimed event is also reported to the context',
    edits: [{ file, find: '              event.preventDefault()\n', replace: '' }],
    tests: documentTests,
  },
  {
    name: 'a claimed event goes to the reporter in context',
    edits: [
      {
        file,
        find: 'Effect.runFork(Effect.provideService(report(event.diagnostic), Reporter, reporter))',
        replace: 'Effect.runFork(report(event.diagnostic))',
      },
    ],
    tests: documentTests,
  },
  {
    name: 'the listener outlives its layer',
    edits: [
      { file, find: 'document.removeEventListener(eventType, listener)', replace: 'void listener' },
    ],
    tests: documentTests,
  },
  {
    name: 'the layer claims nothing',
    edits: [{ file, find: 'Layer.effectDiscard(claim(reporter))', replace: 'Layer.empty' }],
    tests: documentTests,
  },
  {
    name: 'a claimed event is reported to the context as well',
    edits: [
      {
        file,
        find: '? report(diagnostic) : Effect.void',
        replace: '? report(diagnostic) : report(diagnostic)',
      },
    ],
    tests: documentTests,
  },
]
