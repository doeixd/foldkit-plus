/**
 * The receipt-aware adapter, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/adapter.mutations.ts`.
 */
const file = '../../src/adapter/layer.ts'
const tests = ['packages/remote-domain/test/adapter/adapter.test.ts']

export default [
  {
    name: 'rows are ordered by the View cursor, not the revision',
    edits: [
      { file, find: 'snapshot.state[binding.revision] as number', replace: 'snapshot.cursor' },
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
    name: 'an older snapshot is let through',
    edits: [
      {
        file,
        find: 'tombstone ? order <= held.value.revision : order < held.value.revision',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a row at the revision it was deleted at is let through',
    edits: [
      {
        file,
        find: 'tombstone ? order <= held.value.revision : order < held.value.revision',
        replace: 'order < held.value.revision',
      },
    ],
    tests,
  },
  {
    name: 'a read that finds no row records no deletion',
    edits: [
      {
        file,
        find: `                const { row } = yield* admit(binding, request.id, snapshot, asking)`,
        replace: `                if (snapshot.state === null) return Option.none()
                const { row } = yield* admit(binding, request.id, snapshot, asking)`,
      },
    ],
    tests,
  },
  {
    name: 'live losing access to a row records no deletion',
    edits: [
      {
        file,
        find: `admit(binding, requirement.id, { state: null, cursor: 0 }, asking).pipe(
                              Effect.andThen(next),`,
        replace: `Effect.void.pipe(
                              Effect.andThen(next),`,
      },
    ],
    tests,
  },
  {
    name: 'the confirming read does not wait for the receipt',
    edits: [
      {
        file,
        find: 'onSome: receipt => ({ atLeast: receipt }),',
        replace: 'onSome: () => undefined,',
      },
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
    name: 'a committed write whose View is behind answers Unreachable',
    edits: [
      {
        file,
        find: 'onSome: view => confirm(view, target, floor, asking),',
        replace:
          "onSome: view => Effect.flatMap(confirm(view, target, floor, asking), Option.match({ onNone: () => Effect.fail(new RemoteUnreachable({ message: 'behind' })), onSome: Effect.succeedSome })),",
      },
    ],
    tests,
  },
  {
    name: 'a read that did not confirm clears the floor',
    edits: [
      {
        file,
        find: `            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: snapshot =>`,
        replace: `            Option.match({
              onNone: () => Effect.sync(() => { confirmed(binding, id, floor.receipt); return Option.none() }),
              onSome: snapshot =>`,
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
    name: 'rows let through are shared between principals',
    edits: [
      {
        file,
        find: 'const { accepted } = heldFor(asking)',
        replace: 'const { accepted } = heldFor(null)',
      },
    ],
    tests,
  },
  {
    name: 'pending lists every principal’s writes',
    edits: [
      {
        file,
        find: 'pending: Effect.map(principalKey, asking => [...heldFor(asking).floors.values()]),',
        replace:
          'pending: Effect.sync(() => [...principals.values()].flatMap(held => [...held.floors.values()])),',
      },
    ],
    tests,
  },
  {
    name: 'no principal is dropped',
    edits: [{ file, find: 'principals.delete(oldest)', replace: 'void oldest' }],
    tests,
  },
  {
    name: 'a principal is dropped one too early',
    edits: [
      {
        file,
        find: 'if (principals.size <= MAX_PRINCIPALS) break',
        replace: 'if (principals.size < MAX_PRINCIPALS) break',
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
]
