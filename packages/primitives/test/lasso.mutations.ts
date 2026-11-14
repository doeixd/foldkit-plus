/**
 * Lasso, each part broken in turn: `pnpm mutate packages/primitives/test/lasso.mutations.ts`
 * checks a test fails for every one.
 */
const file = '../src/dom/lasso.ts'
const tests = ['packages/primitives/test/lasso.browser.test.ts']

export default [
  {
    name: 'sharing an edge is touching',
    edits: [
      { file, find: 'b.left < a.left + a.width &&', replace: 'b.left <= a.left + a.width &&' },
    ],
    tests,
  },
  {
    name: 'a press on an item or a control starts a lasso',
    edits: [
      {
        file,
        find: 'if (claimed !== null && element.contains(claimed)) return',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'any movement starts a lasso',
    edits: [{ file, find: 'if (moved < DRAG_THRESHOLD) return', replace: '' }],
    tests,
  },
  {
    name: 'a scroll under a held pointer reports nothing',
    edits: [{ file, find: 'if (drawing) report()', replace: '' }],
    tests,
  },
  {
    name: 'the press is kept on the screen, not on the content',
    edits: [
      {
        file,
        find: 'y: clientY - box.top - element.clientTop + element.scrollTop,',
        replace: 'y: clientY - box.top - element.clientTop,',
      },
    ],
    tests,
  },
  {
    name: 'the release reaches the surface as a click',
    edits: [
      {
        file,
        find: "element.addEventListener('click', swallowClick, { capture: true, once: true })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Escape goes on to the page as well',
    edits: [{ file, find: 'event.stopPropagation()', replace: '' }],
    tests,
  },
  {
    name: 'a cancelled lasso still ends with its ids',
    edits: [
      {
        file,
        find: "const result = wasDrawing && outcome === 'ended' ? measure() : undefined",
        replace: 'const result = wasDrawing ? measure() : undefined',
      },
    ],
    tests,
  },
  {
    name: 'Shift is never reported',
    edits: [
      {
        file,
        find: `            last = {
              clientX: pointed.clientX,
              clientY: pointed.clientY,
              shiftKey: pointed.shiftKey === true,
            }
            end('ended')`,
        replace: `            last = { clientX: pointed.clientX, clientY: pointed.clientY, shiftKey: false }
            end('ended')`,
      },
    ],
    tests,
  },
]
