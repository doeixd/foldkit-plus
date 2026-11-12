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
        find: '            arm(ALARM_AFTER_COMMIT).then(',
        replace: '            Promise.resolve().then(',
      },
    ],
    tests,
  },
  {
    name: 'the alarm runs nothing',
    edits: [{ file: host, find: '      await this.react()', replace: '' }],
    tests,
  },
  {
    name: 'an alarm being run counts as one set, so the alarm is not re-armed',
    edits: [
      {
        file: host,
        find: 'if (current === null || current <= Date.now() || current > at)',
        replace: 'if (current === null || current > at)',
      },
    ],
    tests,
    survives:
      'local workerd answers getAlarm() with null inside alarm(), so nothing here shows the guard; it is for a runtime that still reports the alarm being run, which do.test.ts fakes and kills',
  },
]
