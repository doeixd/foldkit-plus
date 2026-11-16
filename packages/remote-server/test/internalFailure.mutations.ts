/**
 * What a caller learns of a failure on the server's side (#573), each step
 * broken in turn: `pnpm mutate packages/remote-server/test/internalFailure.mutations.ts`.
 */
const tests = ['packages/remote-server/test/internalFailure.test.ts']
const index = '../src/index.ts'
const diagnostics = '../src/diagnostics.ts'
const remote = '../../remote/src'
const reported =
  'return Effect.as(Diagnostics.report(defect), { message: INTERNAL_ERROR, incident })'

export default [
  {
    name: 'every Source failure is read as told',
    edits: [{ file: index, find: '      error.told === true', replace: '      true' }],
    tests,
  },
  {
    name: 'no Source failure is read as told',
    edits: [{ file: index, find: '      error.told === true', replace: '      false' }],
    tests,
  },
  {
    name: 'tell marks nothing',
    edits: [
      {
        file: index,
        find: 'new RemoteServerError({ message, told: true })',
        replace: 'new RemoteServerError({ message })',
      },
    ],
    tests,
  },
  {
    name: 'a read sends its Source’s message',
    edits: [
      {
        file: index,
        find: 'failingAs(`read ${name}`, said => new RemoteReadError(said)).source,',
        replace: 'error => Effect.fail(new RemoteReadError({ message: error.message })),',
      },
    ],
    tests,
  },
  {
    name: 'a query sends its Source’s message',
    edits: [
      {
        file: index,
        find: 'failingAs(`query ${payload.query}`, said => new RemoteQueryError(said)).source,',
        replace: 'error => Effect.fail(new RemoteQueryError({ message: error.message })),',
      },
    ],
    tests,
  },
  {
    name: 'a mutation sends its Source’s message',
    edits: [
      {
        file: index,
        find: "Effect.catchTag('RemoteServerError', failed.source),",
        replace:
          "Effect.catchTag('RemoteServerError', error => Effect.fail(new RemoteMutationError({ message: error.message }))),",
      },
    ],
    tests,
  },
  {
    name: 'a live stream sends its Source’s message',
    edits: [
      {
        file: index,
        find: 'Stream.fromEffect(failed.source(error)),',
        replace: 'Stream.fail(new RemoteLiveError({ message: error.message })),',
      },
    ],
    tests,
  },
  {
    name: 'a list drops the incident of its rows’ read',
    edits: [
      {
        file: index,
        find: 'Effect.fail(new RemoteQueryError({ message, incident })),',
        replace: 'Effect.fail(new RemoteQueryError({ message })),',
      },
    ],
    tests,
  },
  {
    name: 'an output that does not encode is answered in fixed words, unreported',
    edits: [
      {
        file: index,
        find: "Effect.catchTag('SchemaError', error => failed.internal(Cause.fail(error))),",
        replace:
          "Effect.catchTag('SchemaError', () => Effect.fail(new RemoteMutationError({ message: 'Invalid mutation output' }))),",
      },
    ],
    tests,
  },
  {
    name: 'a memory read drops what threw from its failure',
    edits: [
      {
        file: index,
        find: 'new RemoteServerError({ message: `${name} could not be read`, cause }),',
        replace: 'new RemoteServerError({ message: `${name} could not be read` }),',
      },
    ],
    tests,
  },
  {
    name: 'a memory list drops what threw from its failure',
    edits: [
      {
        file: index,
        find: 'new RemoteServerError({ message: `${query.name} could not be run`, cause }),',
        replace: 'new RemoteServerError({ message: `${query.name} could not be run` }),',
      },
    ],
    tests,
  },
  {
    name: 'a memory list’s lost cursor is this side’s failure',
    edits: [{ file: index, find: 'throw tell(`Cursor', replace: 'throw new Error(`Cursor' }],
    tests,
  },
  {
    name: 'a memory list tells nothing it was told',
    edits: [
      {
        file: index,
        find: '                  cause instanceof RemoteServerError',
        replace: '                  false',
      },
    ],
    tests,
  },
  {
    name: 'a read’s defect reaches the transport',
    edits: [
      {
        file: index,
        find: 'Effect.catchCauseIf(answering.FoldkitRemoteRead(payload), Cause.hasDies,',
        replace: 'Effect.catchCauseIf(answering.FoldkitRemoteRead(payload), () => false,',
      },
    ],
    tests,
  },
  {
    name: 'a query’s defect reaches the transport',
    edits: [
      {
        file: index,
        find: 'Effect.catchCauseIf(answering.FoldkitRemoteQuery(payload), Cause.hasDies,',
        replace: 'Effect.catchCauseIf(answering.FoldkitRemoteQuery(payload), () => false,',
      },
    ],
    tests,
  },
  {
    name: 'a mutation’s defect reaches the transport',
    edits: [
      {
        file: index,
        find: 'Effect.catchCauseIf(answering.FoldkitRemoteMutate(payload), Cause.hasDies,',
        replace: 'Effect.catchCauseIf(answering.FoldkitRemoteMutate(payload), () => false,',
      },
    ],
    tests,
  },
  {
    name: 'a live stream’s defect reaches the transport',
    edits: [
      {
        file: index,
        find: 'Stream.catchCauseIf(Cause.hasDies, cause => Stream.fromEffect(failed.internal(cause))),',
        replace:
          'Stream.catchCauseIf(() => false, cause => Stream.fromEffect(failed.internal(cause))),',
      },
    ],
    tests,
  },
  {
    name: 'a failure on this side is not reported',
    edits: [
      {
        file: diagnostics,
        find: reported,
        replace: 'return Effect.succeed({ message: INTERNAL_ERROR, incident })',
      },
    ],
    tests,
  },
  {
    name: 'the caller is answered another id than the report’s',
    edits: [
      {
        file: diagnostics,
        find: reported,
        replace:
          'return Effect.as(Diagnostics.report(defect), { message: INTERNAL_ERROR, incident: mintIncident() })',
      },
    ],
    tests,
  },
  {
    name: 'the caller is told the cause',
    edits: [
      {
        file: diagnostics,
        find: reported,
        replace:
          'return Effect.as(Diagnostics.report(defect), { message: Cause.pretty(cause), incident })',
      },
    ],
    tests,
  },
  {
    name: 'the report says nothing of what was asked',
    edits: [{ file: diagnostics, find: '      during,', replace: "      during: 'request'," }],
    tests,
  },
  {
    name: 'answer leaves the incident out of its body',
    edits: [
      {
        file: index,
        find: '...(failure.incident === undefined ? {} : { incident: failure.incident }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a live error frame leaves its incident out',
    edits: [
      {
        file: '../src/fetch.ts',
        find: 'error.incident === undefined ? {} : { incident: error.incident },',
        replace: '{},',
      },
    ],
    tests,
  },
  {
    name: 'the JSON client drops a read’s incident',
    edits: [
      {
        file: `${remote}/json.ts`,
        find: 'new RemoteReadError({ message: error, incident })',
        replace: 'new RemoteReadError({ message: error })',
      },
    ],
    tests,
  },
  {
    name: 'the JSON client drops a query’s incident',
    edits: [
      {
        file: `${remote}/json.ts`,
        find: 'new RemoteQueryError({ message: error, incident })',
        replace: 'new RemoteQueryError({ message: error })',
      },
    ],
    tests,
  },
  {
    name: 'the JSON client drops a mutation’s incident',
    edits: [
      {
        file: `${remote}/json.ts`,
        find: 'new RemoteMutationError({ message: error, refusal, incident })',
        replace: 'new RemoteMutationError({ message: error, refusal })',
      },
    ],
    tests,
  },
  {
    name: 'the Model drops the incident',
    edits: [
      {
        file: `${remote}/client.ts`,
        find: '...(error.incident === undefined ? {} : { incident: error.incident }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'RemoteData.incident reads none',
    edits: [
      {
        file: `${remote}/remoteData.ts`,
        find: 'Option.fromUndefinedOr(error.incident),',
        replace: 'Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'RemoteServer.report answers without reporting',
    edits: [
      {
        file: index,
        find: '    internalFailure(during, Cause.isCause(cause) ? cause : Cause.fail(cause)),',
        replace: "    Effect.succeed({ message: 'Internal error', incident: '0000000000000000' }),",
      },
    ],
    tests,
  },
  {
    name: 'RemoteServer.report wraps a Cause it was given as a failure',
    edits: [
      {
        file: index,
        find: '    internalFailure(during, Cause.isCause(cause) ? cause : Cause.fail(cause)),',
        replace: '    internalFailure(during, Cause.fail(cause)),',
      },
    ],
    tests,
  },
]
