/**
 * A toast stack under a finger, each part broken in turn: `pnpm mutate
 * packages/mixins-ui/test/toastTouch.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/toast.ts'
const tests = ['packages/mixins-ui/test/toast.browser.test.ts']

export default [
  {
    name: 'a finger spreads the stack as the mouse does',
    edits: [
      {
        file,
        find: "event instanceof PointerEvent && event.pointerType !== 'mouse' ? 'touch' : 'pointer'",
        replace: "'pointer' as const",
      },
    ],
    tests,
  },
  {
    name: 'a finger does not hold the countdown',
    edits: [
      {
        file,
        find: 'if (model.pointer || model.touch || model.focus || model.hidden) return new Set()',
        replace: 'if (model.pointer || model.focus || model.hidden) return new Set()',
      },
    ],
    tests,
  },
  {
    name: 'a tap’s focus spreads the stack',
    edits: [
      {
        file,
        find: 'if (event.timeStamp - touchedAt > TAP_FOCUS_MS) offer',
        replace: 'if (true) offer',
      },
    ],
    tests,
  },
]
