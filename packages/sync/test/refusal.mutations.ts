/**
 * Typed refusals, broken in turn on each side of the wire:
 * `pnpm mutate packages/sync/test/refusal.mutations.ts`.
 */
const journal = '../src/journal.ts'
const replica = '../src/sync.ts'
const refusal = '../src/refusal.ts'
const exchangeTests = ['packages/sync/test/journal.test.ts']
const replicaTests = ['packages/sync/test/sync.test.ts']

export default [
  {
    name: 'the server sends no refusals',
    edits: [
      {
        file: journal,
        find: 'refusals.push({ opId, refusal: encodeRefusal(refusal) })',
        replace: 'void refusal',
      },
    ],
    tests: exchangeTests,
  },
  {
    name: 'an authorize or admit reason is dropped from Forbidden',
    edits: [
      {
        file: journal,
        find: 'SyncRefusal.Forbidden({ reason: Option.fromUndefinedOr(reason) }),',
        replace: 'SyncRefusal.Forbidden({ reason: Option.none() }),',
      },
    ],
    tests: exchangeTests,
  },
  {
    name: 'a journal refusal reads as Invalid',
    edits: [
      {
        file: journal,
        find: "Effect.sync(() => forbid(error.opId, error.reason, 'Refused by the server')),",
        replace: "Effect.sync(() => invalid(error.opId, 'Refused by the server')),",
      },
    ],
    tests: exchangeTests,
  },
  {
    name: 'a refusals key is sent when nothing was refused',
    edits: [
      {
        file: journal,
        find: 'const refused = refusals.length === 0 ? {} : { refusals }',
        replace: 'const refused = { refusals }',
      },
    ],
    tests: exchangeTests,
  },
  {
    name: 'the replica reads no refusal',
    edits: [
      {
        file: replica,
        find: 'refusal: Option.fromUndefinedOr(refusalOf.get(opId)),',
        replace: 'refusal: Option.none(),',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal for an operation not rejected is taken',
    edits: [
      {
        file: replica,
        find: 'for (const { opId } of [...(response.refusals ?? []), ...(response.reasons ?? [])])',
        replace: 'for (const { opId } of response.reasons ?? [])',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal this build cannot read goes unreported',
    edits: [
      {
        file: replica,
        find: 'else yield* Diagnostics.report(unknownRefusal(documentId, replicaId, opId, refusal))',
        replace: 'else void unknownRefusal',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal is decoded leniently',
    edits: [
      {
        file: replica,
        find: "const decodeRefusal = Schema.decodeUnknownOption(SyncRefusal, { onExcessProperty: 'error' })",
        replace: 'const decodeRefusal = Schema.decodeUnknownOption(SyncRefusal)',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal’s words are unbounded',
    edits: [
      {
        file: refusal,
        find: 'const Words = Schema.String.check(Schema.isMaxLength(500))',
        replace: 'const Words = Schema.String',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'an Unreadable version may be zero',
    edits: [
      {
        file: refusal,
        find: 'version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))',
        replace: 'version: Schema.Int',
      },
    ],
    tests: replicaTests,
  },
]
