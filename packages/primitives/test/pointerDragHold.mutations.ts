/**
 * A finger's drag, each part broken in turn: `pnpm mutate
 * packages/primitives/test/pointerDragHold.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/dom/pointer-drag.ts'
const tests = ['packages/primitives/test/pointer-drag.test.ts']

export default [
  {
    name: 'a finger is a mouse',
    edits: [
      {
        file,
        find: "const touch = positioned.pointerType === 'touch'",
        replace: 'const touch = false',
      },
    ],
    tests,
  },
  {
    name: 'a finger that moves first still drags once held',
    edits: [
      {
        file,
        find: 'if (pressed.touch) return moved < HOLD_SLOP ? undefined : end(false)',
        replace: 'if (pressed.touch) return',
      },
    ],
    tests,
  },
  {
    name: 'the page scrolls under a finger’s drag',
    edits: [
      { file, find: '            if (dragging !== null) event.preventDefault()\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a held finger never becomes a drag',
    edits: [
      {
        file,
        find: '                    if (pressed !== null && dragging === null) begin(pressed.id)\n',
        replace: '',
      },
    ],
    tests,
  },
]
