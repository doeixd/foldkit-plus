/**
 * What a document host tells a caller it could not serve (#576), each guard
 * broken in turn: `pnpm mutate packages/sync/test/hostAnswers.mutations.ts`.
 * `do.mutations.ts` holds the host's other guards; its tests need a temporary
 * folder Windows refuses, so what a caller reads is tested here, on
 * `documentHost` alone.
 */
const tests = ['packages/sync/test/hostAnswers.test.ts']
const host = '../src/journal.ts'
const diagnostics = '../src/diagnostics.ts'

const answered = '{ error: resolved.failure.reason ?? UNAUTHENTICATED }'
const closed = 'fitCloseReason(error.reason ?? UNAUTHENTICATED)'
const told = 'isRefusal(failure) ? Effect.fail(failure) : Effect.die(failure)'

export default [
  {
    name: 'a refusal’s message is sent in the 401',
    edits: [{ file: host, find: answered, replace: '{ error: resolved.failure.message }' }],
    tests,
  },
  {
    name: 'a refusal’s reason is withheld from the 401',
    edits: [{ file: host, find: answered, replace: '{ error: UNAUTHENTICATED }' }],
    tests,
  },
  {
    name: 'a refusal’s message is the close reason',
    edits: [{ file: host, find: closed, replace: 'error.message' }],
    tests,
  },
  {
    name: 'a refusal’s reason is withheld from the close',
    edits: [{ file: host, find: closed, replace: 'UNAUTHENTICATED' }],
    tests,
  },
  {
    name: 'a close reason is sent whatever its length',
    edits: [{ file: host, find: closed, replace: 'error.reason ?? UNAUTHENTICATED' }],
    tests,
  },
  {
    name: 'a close reason is measured in characters',
    edits: [
      {
        file: host,
        find: 'if (encoder.encode(words).length <= CLOSE_REASON_BYTES) return words',
        replace: 'if (words.length <= CLOSE_REASON_BYTES) return words',
      },
    ],
    tests,
  },
  {
    name: 'a close reason is cut one character short',
    edits: [
      {
        file: host,
        find: 'if (bytes > CLOSE_REASON_BYTES) break',
        replace: 'if (bytes >= CLOSE_REASON_BYTES) break',
      },
    ],
    tests,
  },
  {
    name: 'a failure that is no refusal reads as one',
    edits: [{ file: host, find: told, replace: 'Effect.fail(failure)' }],
    tests,
  },
  {
    name: 'a refusal reads as this side breaking',
    edits: [{ file: host, find: told, replace: 'Effect.die(failure)' }],
    tests,
  },
  {
    name: 'an upgrade that broke is answered with no incident',
    edits: [
      {
        file: diagnostics,
        find: "Response.json({ error: 'Internal error', incident }, { status: 500 })",
        replace: "Response.json({ error: 'Internal error' }, { status: 500 })",
      },
    ],
    tests,
  },
  {
    name: 'the report of an upgrade that broke names no incident',
    edits: [
      {
        file: diagnostics,
        find: 'hostDefect(stage, cause, Option.some(incident))',
        replace: 'hostDefect(stage, cause)',
      },
    ],
    tests,
  },
  {
    name: 'an upgrade that broke is not reported',
    edits: [
      {
        file: diagnostics,
        find: 'reportTo(reporter, hostDefect(stage, cause, Option.some(incident))),',
        replace: 'Effect.void,',
      },
    ],
    tests,
  },
]
