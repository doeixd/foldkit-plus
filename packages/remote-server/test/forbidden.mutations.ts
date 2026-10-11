/**
 * A refusal of who is asking, on each side of the wire, broken in turn:
 * `pnpm mutate packages/remote-server/test/forbidden.mutations.ts`.
 */
const tests = ['packages/remote-server/test/forbidden.test.ts']
const json = '../../remote/src/json.ts'

export default [
  {
    name: 'answer sends a refusal as a failure of the server',
    edits: [
      {
        file: '../src/index.ts',
        find: "Effect.catchTag('Forbidden', error =>",
        replace: "Effect.catchTag('Unheard', error =>",
      },
    ],
    tests,
  },
  {
    name: 'forbid drops its reason',
    edits: [
      {
        file: '../src/index.ts',
        find: '...(reason === undefined ? {} : { reason }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the JSON client reads a refusal as any failure',
    edits: [{ file: json, find: 'forbidden === undefined', replace: 'true' }],
    tests,
  },
  {
    name: 'Remote.http reads every 403 by its body',
    edits: [
      {
        file: json,
        find: 'if (response.status === 403 && !isAnswer(body))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'the wire does not carry Forbidden',
    edits: [
      {
        file: '../../remote/src/wire.ts',
        find: 'error: Schema.Union([RemoteMutationError, RemoteForbidden]),',
        replace: 'error: RemoteMutationError,',
      },
    ],
    tests,
  },
  {
    name: 'the client drops the reason',
    edits: [
      {
        file: '../../remote/src/client.ts',
        find: '...(error.reason === undefined ? {} : { reason: error.reason }),',
        replace: '',
      },
    ],
    tests,
  },
]
