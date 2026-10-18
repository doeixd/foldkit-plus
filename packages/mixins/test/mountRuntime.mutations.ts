/**
 * Composed Mounts failing one at a time, broken in turn:
 * `pnpm mutate packages/mixins/test/mountRuntime.mutations.ts`.
 */
const file = '../src/resolver.ts'
const tests = ['packages/mixins/test/mountRuntime.test.ts']

export default [
  {
    name: 'one failing mount ends the rest',
    edits: [
      {
        file,
        find: 'return Stream.empty',
        replace: 'return Stream.failCause(cause)',
      },
    ],
    tests,
  },
  {
    name: 'a failure is swallowed unreported',
    edits: [
      {
        file,
        find: 'console.error(`[OnMount ${mount.name}] unhandled failure`, cause)',
        replace: 'void cause',
      },
    ],
    tests,
  },
  {
    name: 'an interrupted mount is reported as a failure',
    edits: [
      {
        file: '../src/resolver.ts',
        find: 'if (!Cause.hasInterruptsOnly(cause))',
        replace: 'if (cause !== undefined)',
      },
    ],
    tests: ['packages/mixins/test/mountRuntime.test.ts'],
  },
]
