/**
 * A write made for someone, on the server and over each transport (#405),
 * each step broken in turn: `pnpm mutate
 * packages/remote-server/test/madeFor.mutations.ts`.
 */
const tests = ['packages/remote-server/test/madeFor.test.ts', 'packages/remote/test/store.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const server = '../src/index.ts'

export default [
  edit(
    'a write runs whoever it was made for',
    server,
    'yield* madeFor(server, caller, Option.fromUndefinedOr(payload.principal))',
    '',
  ),
  edit(
    'a write is refused even to whom it was made for',
    server,
    'if (asking === key) return Effect.void',
    'if (false) return Effect.void',
  ),
  edit(
    'a server keeping no keys runs a write naming someone',
    server,
    'if (asking === key) return Effect.void',
    'if (asking === key || asking === undefined) return Effect.void',
  ),
  edit(
    'a visitor is told someone else is signed in',
    server,
    'return asking === null',
    'return false',
  ),
  edit(
    'a read says no one it was for',
    server,
    '...(yield* RemoteServer.readHelper(server, caller, options, payload.requests)),\n          ...answeredFor(server, caller),',
    '...(yield* RemoteServer.readHelper(server, caller, options, payload.requests)),',
  ),
  edit(
    'a list says no one it was for',
    server,
    '...(yield* answerQuery(server, caller, options, payload)),\n          ...answeredFor(server, caller),',
    '...(yield* answerQuery(server, caller, options, payload)),',
  ),
  edit(
    'a write says no one it was for',
    server,
    '...(answered.length === 0 ? {} : { lists: answered }),\n          ...answeredFor(server, caller),',
    '...(answered.length === 0 ? {} : { lists: answered }),',
  ),
  edit(
    'a visitor is said as someone',
    server,
    'onNone: () => null,\n          onSome: viewer => entityKey',
    "onNone: () => 'User:visitor',\n          onSome: viewer => entityKey",
  ),
  edit(
    'a server keeping no keys says whom it answered',
    server,
    'server.viewer === undefined\n    ? {}\n    : {\n        principal:',
    'server.viewer === undefined\n    ? { principal: null }\n    : {\n        principal:',
  ),
  edit(
    'the JSON answer does not name the refusal',
    server,
    'body: { error: error.message, principalChanged: {} },',
    'body: { error: error.message },',
  ),
  edit(
    'the JSON client reads the refusal as a failed write',
    '../../remote/src/json.ts',
    'if (principalChanged !== undefined) return new RemotePrincipalChanged({ message: error })',
    '',
  ),
  edit(
    'Effect RPC cannot carry the refusal',
    '../../remote/src/wire.ts',
    '    RemoteUnauthenticated,\n    RemotePrincipalChanged,\n  ]),',
    '    RemoteUnauthenticated,\n  ]),',
  ),
  edit(
    "a visitor's write runs for anyone",
    server,
    'if (asking === key) return Effect.void',
    'if (asking === key || key === null) return Effect.void',
  ),
  edit(
    "the wire cannot carry a visitor's stamp",
    '../../remote/src/wire.ts',
    'principal: Schema.optional(Schema.NullOr(PrincipalKey)),',
    'principal: Schema.optional(PrincipalKey),',
  ),
  edit(
    'an entity name and an id can share a key',
    '../../remote/src/store.ts',
    "`${entity.replaceAll('%', '%25').replaceAll(':', '%3A')}:${id}`",
    '`${entity}:${id}`',
  ),
]
