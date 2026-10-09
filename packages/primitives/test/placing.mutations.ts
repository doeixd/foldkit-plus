/**
 * Viewport placing, broken in turn:
 * `pnpm mutate packages/primitives/test/placing.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/primitives/test/placing.test.ts']

export default [
  {
    name: 'overflow shifts right, off the window',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'dx: over > 0 ? -over : 0,',
        replace: 'dx: over > 0 ? over : 0,',
      },
    ],
    tests,
  },
  {
    name: 'the panel never flips',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'flip: rect.bottom > viewport.height && rect.top - margin >= rect.height,',
        replace: 'flip: false,',
      },
    ],
    tests,
  },
  {
    name: 'a zero-size trigger is placed as if it had a box',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'if (trigger.width === 0 && trigger.height === 0) return { left: 0, top: 0 }\n  return {',
        replace: 'return {',
      },
    ],
    tests,
  },
  {
    name: 'a point is placed at the origin',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'left: point.x - origin.left,\n  top: point.y - origin.top,',
        replace: 'left: origin.left,\n  top: origin.top,',
      },
    ],
    tests,
  },
  {
    name: 'the popup sits on the trigger instead of under it',
    edits: [
      {
        file: '../src/interaction/placing.ts',
        find: 'top: trigger.bottom - origin.top + gap,',
        replace: 'top: trigger.top - origin.top,',
      },
    ],
    tests,
  },
]
