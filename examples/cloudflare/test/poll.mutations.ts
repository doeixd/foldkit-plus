/**
 * The row log's gate on `pollLive`, broken in turn:
 * `pnpm mutate examples/cloudflare/test/poll.mutations.ts`
 */
const schema = '../src/schema.ts'
const tests = ['examples/cloudflare/test/poll.test.ts']

export default [
  {
    name: 'a quiet tick reads anyway',
    edits: [
      {
        file: schema,
        find: 'if (Option.isSome(only) && only.value.size === 0) return []',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the last entry read is not remembered',
    edits: [{ file: schema, find: '          readAt = log.through\n', replace: '' }],
    tests,
  },
  {
    name: 'every subscribed row is read, logged or not',
    edits: [{ file: schema, find: 'if (!reads(rowId)) continue', replace: '' }],
    tests,
  },
  {
    name: 'an unreadable log reads nothing',
    edits: [
      {
        file: schema,
        find: 'readAt = yield* orSkip(changes.head)\n            return Option.none<ReadonlySet<string>>()',
        replace: 'return Option.some<ReadonlySet<string>>(new Set())',
      },
    ],
    tests,
  },
  {
    name: 'a log that no longer reaches back is read as quiet',
    edits: [
      {
        file: schema,
        find: 'return Option.map(log.ids, (ids): ReadonlySet<string> => new Set(ids))',
        replace:
          'return Option.some<ReadonlySet<string>>(new Set(Option.getOrElse(log.ids, () => [])))',
      },
    ],
    tests,
  },
  {
    name: 'a known list reads its whole window anyway',
    edits: [
      {
        file: schema,
        find: 'const logged = knownIds === undefined ? Option.none() : only',
        replace: 'const logged = Option.none<ReadonlySet<string>>()',
      },
    ],
    tests,
  },
  {
    name: 'a logged row the principal can read does not join',
    edits: [
      {
        file: schema,
        find: 'if (loaded.readable.has(id)) listed.add(id)\n                else listed.delete(id)',
        replace: 'if (!loaded.readable.has(id)) listed.delete(id)',
      },
    ],
    tests,
  },
  {
    name: 'a logged row that is gone stays listed',
    edits: [
      {
        file: schema,
        find: 'if (loaded.readable.has(id)) listed.add(id)\n                else listed.delete(id)',
        replace: 'if (loaded.readable.has(id)) listed.add(id)',
      },
    ],
    tests,
  },
]
