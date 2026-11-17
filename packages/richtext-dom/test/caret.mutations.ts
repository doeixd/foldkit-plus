/**
 * The caret kept in view, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/caret.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const reveal = '../src/reveal.ts'
const tests = ['packages/richtext-dom/test/caret.browser.test.ts']

export default [
  {
    name: 'an edit never scrolls',
    edits: [{ file, find: '    if (asked) revealSelection(state.selection)', replace: '' }],
    tests,
  },
  {
    name: 'every draw scrolls, another person’s edit included',
    edits: [
      {
        file,
        find: '    const asked = unanswered > 0 || undoing !== undefined',
        replace: '    const asked = true',
      },
    ],
    tests,
  },
  {
    name: 'a draw scrolls though the editor does not own the selection',
    edits: [
      {
        file,
        find: '    if (!owned) return\n    restoreSelection(current, state.selection)\n    if (asked)',
        replace: '    if (owned) restoreSelection(current, state.selection)\n    if (asked)',
      },
    ],
    tests,
  },
  {
    name: 'a selection the editor makes in code is not scrolled to',
    edits: [{ file, find: '    if (reveal) revealSelection(selection)', replace: '' }],
    tests,
  },
  {
    name: 'a block stands for the caret in it',
    edits: [
      {
        file,
        find: '    const rect = caretRect(range)\n    const node = range.startContainer\n    const from = node instanceof Element ? node : node.parentElement',
        replace:
          '    const node = range.startContainer\n    const from = node instanceof Element ? node : node.parentElement\n    const rect = from?.getBoundingClientRect()',
      },
    ],
    tests,
  },
  {
    name: 'a caret at an element’s edge beside text is the whole element',
    edits: [
      {
        file: reveal,
        find: '    if (text !== undefined && text.length > 0) {',
        replace: '    if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'an empty line is only its break',
    edits: [{ file: reveal, find: "holder.textContent === ''", replace: 'false' }],
    tests,
  },
  {
    name: 'a scrolling box is skipped',
    edits: [{ file: reveal, find: '    if (!scrolls) continue', replace: '    continue' }],
    tests,
  },
  {
    name: 'the window is not scrolled',
    edits: [
      {
        file: reveal,
        find: "(x, y) => view.scrollBy({ left: x, top: y, behavior: 'instant' }),",
        replace: '() => {},',
      },
    ],
    tests,
  },
  {
    name: 'scroll-padding is ignored',
    edits: [
      {
        file: reveal,
        find: '      visible.top + inset(style.scrollPaddingTop, height),',
        replace: '      visible.top,',
      },
    ],
    tests,
  },
  {
    name: 'a caret already in view is scrolled to the edge',
    edits: [
      {
        file: reveal,
        find: '  if (from < start) return from - start\n  if (to > end) return to - end\n  return 0',
        replace: '  return from - start',
      },
    ],
    tests,
  },
  {
    name: 'a Range without rectangles, as in jsdom, throws',
    edits: [
      {
        file: reveal,
        find: "if (typeof range.getClientRects !== 'function') return undefined",
        replace: '',
      },
    ],
    tests: ['packages/richtext-dom/test/events.test.ts'],
  },
  {
    name: 'a window without a visual viewport, as in jsdom, throws',
    edits: [
      {
        file: reveal,
        find: 'const visual = view.visualViewport ?? undefined',
        replace: 'const visual = view.visualViewport',
      },
      { file: reveal, find: 'visual === undefined', replace: 'visual === null' },
    ],
    tests: ['packages/richtext-dom/test/atom.test.ts'],
  },
]
