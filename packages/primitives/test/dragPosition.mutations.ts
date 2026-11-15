/**
 * What a drag writes on the root for something that follows the pointer:
 * `pnpm mutate packages/primitives/test/dragPosition.mutations.ts`.
 */
const file = '../src/dom/pointer-drag.ts'
const tests = ['packages/primitives/test/pointer-drag.test.ts']

export default [
  {
    name: 'the place is written when the drag begins and never again',
    edits: [
      {
        file,
        find: '                writeAt(positioned.clientX ?? 0, positioned.clientY ?? 0)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a finger’s hold starts the drag with no place',
    edits: [{ file, find: '            writeAt(pressed.x, pressed.y)\n', replace: '' }],
    tests,
  },
  {
    name: 'every drag is a mouse’s',
    edits: [
      {
        file,
        find: "root.setAttribute(DRAGGING.kind, pressed.kind === '' ? 'mouse' : pressed.kind)",
        replace: "root.setAttribute(DRAGGING.kind, 'mouse')",
      },
    ],
    tests,
  },
  {
    name: 'a drop leaves the place on the root',
    edits: [
      {
        file,
        find: '            scroller?.stop()\n            clearAt()\n            const id = dragging',
        replace: '            scroller?.stop()\n            const id = dragging',
      },
    ],
    tests,
  },
  {
    name: 'a mount that ends mid-drag leaves the place on the root',
    edits: [
      {
        file,
        find: '            scroller?.stop()\n            clearAt()\n            release()',
        replace: '            scroller?.stop()\n            release()',
      },
    ],
    tests,
  },
]
