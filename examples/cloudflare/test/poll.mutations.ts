/**
 * The change count's gate on `pollLive`, broken in turn:
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
        find: 'if (count !== undefined && count === readAt) return []',
        replace: 'if (false) return []',
      },
    ],
    tests,
  },
  {
    name: 'a moved count is not remembered',
    edits: [{ file: schema, find: '          readAt = count\n', replace: '' }],
    tests,
  },
  {
    name: 'an unreadable count stops the reads',
    edits: [
      {
        file: schema,
        find: 'if (count !== undefined && count === readAt) return []',
        replace: 'if (count === readAt) return []',
      },
    ],
    tests,
  },
]
