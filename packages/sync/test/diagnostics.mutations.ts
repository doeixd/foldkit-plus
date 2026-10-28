/**
 * Sync's reports, each broken in turn:
 * `pnpm mutate packages/sync/test/diagnostics.mutations.ts`.
 */
const tests = [
  'packages/sync/test/diagnostics.test.ts',
  'packages/sync/test/do.test.ts',
  'packages/sync/test/presence.test.ts',
]
const replica = '../src/sync.ts'
const host = '../src/journal.ts'
const durable = '../src/do.ts'
const diagnostics = '../src/diagnostics.ts'

export default [
  {
    name: 'a rebuilt history is not reported',
    edits: [
      {
        file: replica,
        find: '            if (restarted) yield* Diagnostics.report(historyRebuilt(documentId, replicaId))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'every exchange reports a rebuilt history',
    edits: [
      {
        file: replica,
        find: 'if (restarted) yield* Diagnostics.report(historyRebuilt(documentId, replicaId))',
        replace: 'yield* Diagnostics.report(historyRebuilt(documentId, replicaId))',
      },
    ],
    tests,
  },
  {
    name: 'a failed exchange is not reported',
    edits: [
      {
        file: replica,
        find: '            yield* Diagnostics.report(exchangeFailed(documentId, replicaId, error))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failed exchange is reported as an error',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'ExchangeFailed',\n  source,\n  level: 'warning',",
        replace: "  _tag: 'ExchangeFailed',\n  source,\n  level: 'error',",
      },
    ],
    tests,
  },
  {
    name: 'a host answers a defect with no report',
    edits: [
      { file: host, find: '      await Effect.runPromise(report(stage, cause))\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a host ignores the reporter it was given',
    edits: [
      {
        file: host,
        find: 'reportTo(reporter, hostDefect(stage, cause))',
        replace: 'reportTo(undefined, hostDefect(stage, cause))',
      },
    ],
    tests,
  },
  {
    name: 'the given reporter is never used',
    edits: [
      {
        file: diagnostics,
        find: '    : Effect.provideService(reported, Diagnostics.Reporter, reporter)',
        replace: '    : reported',
      },
    ],
    tests,
  },
  {
    name: 'a journal that never opened is reported as a resolver',
    edits: [
      {
        file: host,
        find: "return defect('Journal', Cause.die(journal.failure))",
        replace: "return defect('Resolve', Cause.die(journal.failure))",
      },
    ],
    tests,
  },
  {
    name: 'an opens that throws is reported without its cause',
    edits: [
      {
        file: host,
        find: "      return defect('Exchange', Cause.die(error))",
        replace: "      return defect('Exchange', Cause.die('broke'))",
      },
    ],
    tests,
  },
  {
    name: 'a resolver dying on revalidation is not reported',
    edits: [{ file: host, find: "? report('Revalidate', cause)", replace: '? Effect.void' }],
    tests,
  },
  {
    name: 'an opens failing before a notice is not reported',
    edits: [
      {
        file: host,
        find: 'Effect.catchCause(opens, cause => Effect.as(report(cause), false))',
        replace: 'Effect.catchCause(opens, () => Effect.succeed(false))',
      },
    ],
    tests,
  },
  {
    name: 'an opens failing before a notice sends the notice',
    edits: [
      {
        file: host,
        find: 'Effect.as(report(cause), false)',
        replace: 'Effect.as(report(cause), true)',
      },
    ],
    tests,
  },
  {
    name: "serveJournal ignores the host's reporter",
    edits: [
      {
        file: host,
        find: 'reportTo(diagnostics, hostDefect(',
        replace: 'reportTo(undefined, hostDefect(',
      },
    ],
    tests,
  },
  {
    name: 'a socket pair that broke is reported without its cause',
    edits: [
      {
        file: durable,
        find: "            hostDefect('Upgrade', Cause.die(error)),",
        replace: "            hostDefect('Upgrade', Cause.die('no pair')),",
      },
    ],
    tests,
  },
  {
    name: "the durable object ignores the host's reporter",
    edits: [
      {
        file: durable,
        find: '            diagnostics === undefined ? undefined : diagnostic => diagnostics(diagnostic, request),',
        replace: '            undefined,',
      },
    ],
    tests,
  },
  {
    name: 'a host defect is reported as a warning',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'HostDefect',\n  source,\n  level: 'error',",
        replace: "  _tag: 'HostDefect',\n  source,\n  level: 'warning',",
      },
    ],
    tests,
  },
  {
    name: 'a presence listener that throws is not reported',
    edits: [
      {
        file: '../src/presence.ts',
        find: "          yield* Diagnostics.report(listenerFailed('Presence', thrown))",
        replace: '          yield* Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a socket listener that throws is not reported',
    edits: [
      {
        file: '../src/transport.ts',
        find: "Diagnostics.report(listenerFailed('Socket', thrown))",
        replace: 'Effect.void',
      },
    ],
    tests,
  },
  {
    name: "a socket listener's failure goes to whatever reporter its callback finds",
    edits: [
      {
        file: '../src/transport.ts',
        find: '                      Effect.provideService(Diagnostics.Reporter, reporter),\n',
        replace: '',
      },
    ],
    tests,
  },
]
