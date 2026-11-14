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
        find: '? Stream.empty',
        replace: '? Stream.failCause(cause)',
      },
    ],
    tests,
  },
  {
    name: 'a failure is swallowed unreported',
    edits: [
      {
        file,
        find: 'Reported.dispatch(element, mountFailed(held.action.name, slotOf, cause))',
        replace: 'Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a failing mount is not reported as an error',
    edits: [
      {
        file: '../src/mountFailed.ts',
        find: "level: 'error',",
        replace: "level: 'warning',",
      },
    ],
    tests,
  },
  {
    name: 'a failing mount is reported without its slot',
    edits: [
      {
        file,
        find: 'mountFailed(held.action.name, slotOf, cause)',
        replace: 'mountFailed(held.action.name, Option.none(), cause)',
      },
    ],
    tests,
  },
  {
    name: 'an interrupted mount is reported as a failure',
    edits: [
      {
        file: '../src/resolver.ts',
        find: 'Cause.hasInterruptsOnly(cause)',
        replace: 'false',
      },
    ],
    tests: ['packages/mixins/test/mountRuntime.test.ts'],
  },
  {
    name: "a failing mount reports only to the reporter in context, which an application's never is",
    edits: [
      {
        file,
        find: 'Reported.dispatch(element, mountFailed(held.action.name, slotOf, cause))',
        replace: 'Reported.report(mountFailed(held.action.name, slotOf, cause))',
      },
    ],
    tests,
  },
]
