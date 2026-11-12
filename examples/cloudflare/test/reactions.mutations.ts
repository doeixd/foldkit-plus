/**
 * A Durable Object's reactions on workerd, broken in the host:
 * `pnpm mutate examples/cloudflare/test/reactions.mutations.ts`.
 */
const tests = ['examples/cloudflare/test/reactions.test.ts']
const host = '../../../packages/sync/src/do.ts'

export default [
  {
    name: 'no alarm is set before the reply, so eviction loses the run',
    edits: [
      {
        file: host,
        find: '          yield* Effect.promise(() => arm(ALARM_AFTER_COMMIT))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the alarm runs nothing',
    edits: [{ file: host, find: '      await this.react()', replace: '' }],
    tests,
  },
]
