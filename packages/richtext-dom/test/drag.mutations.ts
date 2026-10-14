/**
 * The dragged block's mark and the scrolling at the window's edges, each broken in turn:
 * `pnpm mutate packages/richtext-dom/test/drag.mutations.ts` checks that a test fails for each.
 */
const file = '../src/drag.ts'
const tests = ['packages/richtext-dom/test/drag.test.ts']

export default [
  {
    name: 'a press alone marks the block',
    edits: [
      {
        file,
        find: '      moving = dom.elements.get(node)\n',
        replace:
          "      moving = dom.elements.get(node)\n      moving?.setAttribute('data-richtext-dragging', '')\n",
      },
    ],
    tests,
  },
  {
    name: 'the mark stays after the drag',
    edits: [{ file, find: "    moving?.removeAttribute('data-richtext-dragging')\n", replace: '' }],
    tests,
  },
  {
    name: 'a drag never scrolls the page',
    edits: [
      {
        file,
        find: '    place(pointed.clientY ?? lastY)\n    scrollSoon()\n',
        replace: '    place(pointed.clientY ?? lastY)\n',
      },
    ],
    tests,
  },
  {
    name: 'scrolling goes on after the drag ends',
    edits: [
      {
        file,
        find: '    if (frame !== undefined) view?.cancelAnimationFrame(frame)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the page scrolls the wrong way',
    edits: [
      {
        file,
        find: '  if (nearTop > 0) return -Math.ceil(',
        replace: '  if (nearTop > 0) return Math.ceil(',
      },
    ],
    tests,
  },
]
