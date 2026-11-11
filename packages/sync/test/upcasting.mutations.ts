/**
 * Upcasting durable Messages, broken in turn in the codec, the replica, the
 * exchange and the journal:
 * `pnpm mutate packages/sync/test/upcasting.mutations.ts`.
 */
const sync = '../src/sync.ts'
const journal = '../src/journal.ts'
const migrations = '../src/migrations.ts'
const make = '../src/make.ts'
const durable = '../../durable/src/journal.ts'
const tests = ['packages/sync/test/upcasting.test.ts']
const durableTests = ['packages/durable/test/journal.test.ts']

export default [
  {
    name: 'an old operation is read as the current version, not upcast',
    edits: [
      {
        file: sync,
        find: 'decoded = decodeMessage(history.upcast(version, operation.message))',
        replace: 'decoded = decodeMessage(operation.message)',
      },
    ],
    tests,
  },
  {
    name: 'a step is not checked against its own Schema before it runs',
    edits: [
      {
        file: migrations,
        find: '        value = steps[at]!.up!(steps[at - 1]!.normalize(value))',
        replace: '        value = steps[at]!.up!(value)',
      },
    ],
    tests,
  },
  {
    name: 'a newer version is read as the current one',
    edits: [
      {
        file: sync,
        find: '    if (version > current) throw newer(operation.opId, version)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'every version is written, 1 included',
    edits: [
      {
        file: sync,
        find: 'current === 1 ? envelope : { ...envelope, messageVersion: current }',
        replace: '{ ...envelope, messageVersion: current }',
      },
    ],
    tests,
  },
  {
    name: 'nothing past 1 is written with its version',
    edits: [
      {
        file: sync,
        find: 'current === 1 ? envelope : { ...envelope, messageVersion: current }',
        replace: 'envelope',
      },
    ],
    tests,
  },
  {
    name: 'the compared form is the upcast one',
    edits: [
      {
        file: sync,
        find: '      message: history.normalize(version, written.message),',
        replace: '      message: encodeMessage(messageOf(written)),',
      },
    ],
    tests,
  },
  {
    name: 'the compared form keeps an explicit version 1',
    edits: [
      {
        file: sync,
        find: '      ...(version === 1 ? {} : { messageVersion: version }),',
        replace:
          '      ...(written.messageVersion === undefined ? {} : { messageVersion: version }),',
      },
    ],
    tests,
  },
  {
    name: 'an unreadable pending operation blocks the outbox',
    edits: [
      {
        file: sync,
        find: '          if (cause instanceof UnreadableMessageError) unreadable.add(pending)',
        replace: '          if (cause instanceof UnreadableMessageError) void pending',
      },
    ],
    tests,
  },
  {
    name: 'an outbox from a newer build is opened as invalid',
    edits: [
      {
        file: sync,
        find: '          if (cause instanceof UnsupportedMessageVersionError) return yield* cause\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the refusal made on open is not written',
    edits: [
      {
        file: sync,
        find: '      if (opened !== state) yield* store(opened, state.revision)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'dismiss writes nothing',
    edits: [
      {
        file: sync,
        find: '            yield* persist(next, current)\n            return [true, next] as const',
        replace: '            return [true, next] as const',
      },
    ],
    tests,
  },
  {
    name: 'a server Unreadable refusal drops the operation',
    edits: [
      {
        file: sync,
        find: '                    Unreadable: () => [opId],',
        replace: '                    Unreadable: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'a newer committed operation reads as invalid history',
    edits: [
      {
        file: sync,
        find: '                  cause instanceof UnsupportedMessageVersionError\n                    ? cause\n                    : new',
        replace: '                  false\n                    ? cause\n                    : new',
      },
    ],
    tests,
  },
  {
    name: 'the server scans no version before appending',
    edits: [
      {
        file: journal,
        find: '        if (Option.isSome(found) && found.value > supported)',
        replace: '        if (Option.isSome(found) && found.value < 0)',
      },
    ],
    tests,
  },
  {
    name: 'an unreadable entry is rejected as Invalid',
    edits: [
      {
        file: journal,
        find: '        cause instanceof UnreadableMessageError ? Option.some(cause) : Option.none(),',
        replace: '        Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'the journal is given the upcast operation, not the entry as received',
    edits: [
      {
        file: journal,
        find: '        yield* journal.append(key, written, principal).pipe(',
        replace:
          '        yield* journal.append(key, sync.journalContract().operation.encode(operation), principal).pipe(',
      },
    ],
    tests,
  },
  {
    name: 'admit sees the Message as written',
    edits: [
      {
        file: journal,
        find: '      return Result.succeed({ written, operation: sync.codec.normalizeOperation(written) })',
        replace:
          '      return Result.succeed({ written, operation: { ...(sync.codec.normalizeOperation(written)), message: written.message } })',
      },
    ],
    tests,
  },
  {
    name: 'committed rows are sent decoded, without their version',
    edits: [
      {
        file: journal,
        find: '      ...contract.operation.encode(committed.operation),',
        replace: '      ...committed.operation,',
      },
    ],
    tests,
  },
  {
    name: 'an unreadable stored row is an untyped JournalError',
    edits: [
      {
        file: journal,
        find: '          ? Option.getOrElse(unreadableHistory(sync.documentId, error.cause), () => error)',
        replace: '          ? error',
      },
    ],
    tests,
  },
  {
    name: 'a stored row of a newer version is an untyped JournalError',
    edits: [
      {
        file: journal,
        find: '  if (cause instanceof UnsupportedMessageVersionError)\n',
        replace: '  if (false)\n',
      },
    ],
    tests,
  },
  {
    name: 'a step is given its version’s value as written, not normalized',
    edits: [
      {
        file: migrations,
        find: '        value = steps[at]!.up!(steps[at - 1]!.normalize(value))',
        replace: '        value = steps[at]!.up!((steps[at - 1]!.normalize(value), value))',
      },
    ],
    tests,
  },
  {
    name: 'a history made by hand is read as one',
    edits: [
      {
        file: migrations,
        find: '  if (history === undefined) throw',
        replace: '  if (false) throw',
      },
    ],
    tests,
  },
  {
    name: 'dismissing an id not held still writes',
    edits: [
      {
        file: sync,
        find: '            if (left.length === refused.length) return [false, current] as const\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an unreadable history tells the replica whose operation it is',
    edits: [
      {
        file: journal,
        find: "const HISTORY_UNREADABLE = 'This server cannot read the history of this document'",
        replace: 'const HISTORY_UNREADABLE = String(Math.random())',
      },
    ],
    tests,
  },
  {
    name: 'make takes a history that does not end at the application’s Message',
    edits: [
      {
        file: make,
        find: '(migrations.current as unknown) !== app.Message',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'make ignores the history',
    edits: [
      {
        file: make,
        find: '      ...(migrations === undefined\n',
        replace: '      ...(true\n',
      },
    ],
    tests,
  },
  {
    name: 'the journal hashes what it stores, not the compared form',
    edits: [
      {
        file: durable,
        find: '        payloadHash: hashPayload(comparedJson),',
        replace: '        payloadHash: hashPayload(encoded),',
      },
    ],
    tests: [...tests, ...durableTests],
  },
  {
    name: 'a row with no hash is compared as stored',
    edits: [
      {
        file: durable,
        find: 'return canonicalJson(compared === undefined ? stored : compared(stored))',
        replace: 'return canonicalJson(stored)',
      },
    ],
    tests: durableTests,
  },
  {
    name: 'a committed row that will not read is the sender’s fault',
    edits: [
      {
        file: durable,
        find: "            catch: cause => journalError('Could not read a committed operation', cause),\n          })",
        replace:
          "            catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),\n          })",
      },
    ],
    tests: durableTests,
  },
]
