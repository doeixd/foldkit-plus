/**
 * The adapter, broken in turn; what it orders and holds is Remote's now:
 * `pnpm mutate packages/remote-domain/test/adapter/adapter.mutations.ts`.
 */
const file = '../../src/adapter/layer.ts'
const tests = ['packages/remote-domain/test/adapter/adapter.test.ts']

export default [
  {
    name: 'rows carry no revision for Remote to order them by',
    edits: [
      {
        file,
        find: 'const revision = state[binding.revision]',
        replace: 'const revision = undefined',
      },
    ],
    tests,
  },
  {
    // Domain's cursor stays put on a state-only change (P5): passed through, so would Remote's.
    name: "live sends Domain's cursor, which a state-only change does not move",
    edits: [
      {
        file,
        find: 'const next = Ref.updateAndGet(cursor, at => at + 1)',
        replace: 'const next = Ref.get(cursor)',
      },
    ],
    tests,
  },
  {
    name: 'a read at a receipt does not wait for it',
    edits: [
      { file, find: 'onSome: atLeast => ({ atLeast }),', replace: 'onSome: () => undefined,' },
    ],
    tests,
  },
  {
    name: 'the command id leaves out who asks',
    edits: [
      {
        file,
        find: 'JSON.stringify([asking, target, request.keys ?? null, encoded])',
        replace: 'JSON.stringify([null, target, request.keys ?? null, encoded])',
      },
    ],
    tests,
  },
  {
    name: 'the command id leaves out the input',
    edits: [
      {
        file,
        find: 'JSON.stringify([asking, target, request.keys ?? null, encoded])',
        replace: 'JSON.stringify([asking, target, request.keys ?? null])',
      },
    ],
    tests,
  },
  {
    name: 'a recorded command is sent again',
    edits: [
      {
        file,
        find: 'Option.match(Option.fromUndefinedOr(committed.get(commandId)), {',
        replace: 'Option.match(Option.fromUndefinedOr(undefined), {',
      },
    ],
    tests,
  },
  {
    name: 'a committed write whose View is behind gives no token',
    edits: [
      {
        file,
        find: '            Option.isSome(bound) && Option.isNone(confirmation)\n',
        replace: '            false\n',
      },
    ],
    tests,
  },
  {
    name: 'a confirmed write gives a token too',
    edits: [
      {
        file,
        find: '            Option.isSome(bound) && Option.isNone(confirmation)\n',
        replace: '            Option.isSome(bound)\n',
      },
    ],
    tests,
  },
  {
    name: 'a read the View is behind on fails rather than name the row behind',
    edits: [
      {
        file,
        find: '                  Option.isSome(receipt)\n                    ? Effect.succeed',
        replace: '                  false\n                    ? Effect.succeed',
      },
    ],
    tests,
  },
  {
    name: 'a token that is no receipt reads at none',
    edits: [
      {
        file,
        find: "      onNone: () => Effect.fail(refused(`${entity} ${id}'s token is not a Domain receipt`)),",
        replace:
          "      onNone: () => Effect.succeed([keyOf(entity, id), { stream: 'x', version: 0 }] as const),",
      },
    ],
    tests,
  },
  {
    name: 'a write with no operation is sent',
    edits: [{ file, find: 'if (request.operation === undefined)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a write made for another principal is sent',
    edits: [
      {
        file,
        find: 'if (request.principal !== undefined && request.principal !== asking)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a row validate hides fails the read',
    edits: [
      {
        file,
        find: 'Rejected: () => Effect.succeed(Option.some({ state: null, cursor: 0 })),',
        replace: "Rejected: () => Effect.fail(new RemoteUnreachable({ message: 'hidden' })),",
      },
    ],
    tests,
  },
  {
    name: 'written is accepted where who may write may not read',
    edits: [
      {
        file: '../../src/adapter/binding.ts',
        find: 'if (given.written !== undefined) checkWritten(entity, mutation.name)',
        replace: 'if (false) checkWritten(entity, mutation.name)',
      },
    ],
    tests,
  },
  {
    name: 'written is accepted where a member has a Read rule of its own',
    edits: [
      {
        file: '../../src/adapter/binding.ts',
        find: "if (surfaces['Read'] !== undefined) refuse(",
        replace: 'if (false) refuse(',
      },
    ],
    tests,
  },
  {
    name: "an Unauthenticated outcome's reason dropped",
    edits: [
      {
        file,
        find: 'message: `Sign in to send ${binding.command}`,\n                ...Option.match(reason, { onNone: () => ({}), onSome: reason => ({ reason }) }),',
        replace: 'message: `Sign in to send ${binding.command}`,',
      },
    ],
    tests,
  },
  {
    name: 'an Unauthenticated outcome answered as RemoteForbidden, to the adapter',
    edits: [
      {
        file,
        find: '              new RemoteUnauthenticated({\n                message: `Sign in to send ${binding.command}`,',
        replace:
          '              new RemoteForbidden({\n                message: `Sign in to send ${binding.command}`,',
      },
    ],
    tests,
  },
  {
    name: 'a live frame held to a receipt is sent as it is',
    edits: [
      {
        file,
        find: '                        onSome: () =>\n                          snapshotAt(binding, requirement.id, receipt).pipe(',
        replace:
          '                        onSome: () =>\n                          Effect.succeedSome(snapshot).pipe(',
      },
    ],
    tests,
  },
]
