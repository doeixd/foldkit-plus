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
        find: 'SyncRefusal.Forbidden({ reason: Option.fromUndefinedOr(fitted) }),',
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
        find: 'yield* Diagnostics.report(\n                unknownRefusal(',
        replace: 'yield* Effect.succeed(\n                unknownRefusal(',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal is decoded leniently',
    edits: [
      {
        file: replica,
        find: "const decodeRefusal = Schema.decodeUnknownResult(SyncRefusal, { onExcessProperty: 'error' })",
        replace: 'const decodeRefusal = Schema.decodeUnknownResult(SyncRefusal)',
      },
    ],
    tests: replicaTests,
  },
  {
    name: 'a refusal’s words are unbounded',
    edits: [
      {
        file: refusal,
        find: 'const Words = Schema.String.check(Schema.isMaxLength(WORDS))',
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
  {
    name: 'the deprecated words lose their fixed sentence',
    edits: [{ file: journal, find: 'fitted ?? otherwise,', replace: "fitted ?? ''," }],
    tests: exchangeTests,
  },
  {
    name: 'two refusals for one operation are taken',
    edits: [{ file: replica, find: 'if (refusing.has(opId))', replace: 'if (false)' }],
    tests: replicaTests,
  },
  {
    name: 'a long reason is sent whole',
    edits: [
      {
        file: journal,
        find: 'const fitted = reason === undefined ? undefined : fitWords(reason)',
        replace: 'const fitted = reason',
      },
    ],
    tests: exchangeTests,
  },
  {
    name: 'words are cut inside a surrogate pair',
    edits: [
      {
        file: refusal,
        find: 'const cut = end >= 0xd800 && end <= 0xdbff ? WORDS - 2 : WORDS - 1',
        replace: 'const cut = WORDS - 1',
      },
    ],
    tests: ['packages/sync/test/refusal.test.ts'],
  },
]
