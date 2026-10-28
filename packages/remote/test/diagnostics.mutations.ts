/**
 * Remote's diagnostics, broken in turn:
 * `pnpm mutate packages/remote/test/diagnostics.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote/test/diagnostics.test.ts']
const reporting = '../src/reporting.ts'

export default [
  {
    name: 'a failure the application hears is recorded',
    edits: [{ file: reporting, find: 'const unheard = heard ? [] :', replace: 'const unheard =' }],
    tests,
  },
  {
    name: 'a failure already settled is recorded again',
    edits: [
      {
        file: reporting,
        find: "message._tag === 'MutationFailed' && before.mutations.pending.has(message.requestId)",
        replace: "message._tag === 'MutationFailed'",
      },
    ],
    tests,
  },
  {
    name: 'an unheard write names no mutation',
    edits: [
      {
        file: reporting,
        find: 'Option.fromUndefinedOr(before.mutations.writes.get(message.requestId)),',
        replace: 'Option.none<StartedWrite>(),',
      },
      {
        file: reporting,
        find: "import type { RemoteMessage, RemoteModel } from './model.js'",
        replace:
          "import type { RemoteMessage, RemoteModel } from './model.js'\nimport type { StartedWrite } from './mutation.js'",
      },
    ],
    tests,
  },
  {
    name: 'what was kept before is reported again',
    edits: [
      {
        file: reporting,
        find: 'recorded.filter(diagnostic => !known.has(diagnostic))',
        replace: 'recorded',
      },
    ],
    tests,
  },
  {
    name: 'an unheard write is reported, not recorded',
    edits: [
      {
        file: reporting,
        find: 'diagnostics: withDiagnostics(remote.diagnostics, unheard),',
        replace: 'diagnostics: remote.diagnostics,',
      },
    ],
    tests,
  },
  {
    name: 'nothing is reported',
    edits: [
      {
        file: reporting,
        find: 'Effect.forEach(diagnostics, Diagnostics.report, { discard: true })',
        replace: 'Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a fold does not report',
    edits: [
      {
        file: '../src/index.ts',
        find: 'commands: (reduced.commands ?? []).map(command => mapMessage(command, toParentMessage)),',
        replace: 'commands: [],',
      },
    ],
    tests,
  },
  {
    name: 'a fold reads its own update as deaf',
    edits: [
      {
        file: '../src/index.ts',
        find: 'reduceReporting(domain.store, domain.reduce, model, message, true)',
        replace: 'reduceReporting(domain.store, domain.reduce, model, message, false)',
      },
    ],
    tests,
  },
  {
    name: 'the wiring ignores what it shares',
    edits: [
      {
        file: '../src/index.ts',
        find: "(options.shared ?? []).some(tag => tag === 'MutationFailed'),",
        replace: 'false,',
      },
    ],
    tests,
  },
  {
    name: 'the window keeps the oldest',
    edits: [
      {
        file: '../src/diagnostics.ts',
        find: '[...kept, ...recorded].slice(-DIAGNOSTIC_WINDOW)',
        replace: '[...kept, ...recorded].slice(0, DIAGNOSTIC_WINDOW)',
      },
    ],
    tests,
  },
  {
    name: 'the window keeps everything',
    edits: [
      {
        file: '../src/diagnostics.ts',
        find: '[...kept, ...recorded].slice(-DIAGNOSTIC_WINDOW)',
        replace: '[...kept, ...recorded]',
      },
    ],
    tests,
  },
  {
    name: 'the answer to a report changes the Model',
    edits: [
      {
        file: '../src/model.ts',
        find: "    case 'CompletedReportDiagnostics':\n      return model",
        replace:
          "    case 'CompletedReportDiagnostics':\n      return { ...model, diagnostics: [] }",
      },
    ],
    tests,
  },
]
