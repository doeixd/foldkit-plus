/**
 * `FluidHover`, broken in turn:
 * `pnpm mutate packages/primitives/test/fluid-hover.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/fluid-hover.browser.test.ts']
const file = '../src/dom/fluid-hover.ts'

export default [
  {
    name: 'a gap between items highlights nothing',
    edits: [
      {
        file,
        find: 'Math.max(low - at, 0, at - high)',
        replace: '(low <= at && at <= high ? 0 : Infinity)',
      },
    ],
    tests,
  },
  {
    name: 'a disabled item is highlighted',
    edits: [{ file, find: '              if (isDisabled(each)) continue\n', replace: '' }],
    tests,
  },
  {
    name: 'a list reads both axes',
    edits: [{ file, find: '  y: (dx, dy) => dy * 1e6 + dx,', replace: '  y: Math.hypot,' }],
    tests,
  },
  {
    name: 'a grid reads one axis',
    edits: [{ file, find: '  xy: Math.hypot,', replace: '  xy: (dx, dy) => dy * 1e6 + dx,' }],
    tests,
  },
  {
    name: 'the highlight slides in from where it last was',
    edits: [
      {
        file,
        find: "if (appearing) container.style.setProperty(property.moving, '0')",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'leaving keeps the highlight',
    edits: [
      {
        file,
        find: '            if (!container.contains(document.activeElement)) hide()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a touch is followed',
    edits: [{ file, find: "            if (event.pointerType === 'touch') return\n", replace: '' }],
    tests,
  },
  {
    name: 'a click in a gap presses nothing',
    edits: [
      { file, find: '            if (press instanceof HTMLElement) press.click()', replace: '' },
    ],
    tests,
  },
  {
    name: 'a click on an item presses its control',
    edits: [{ file, find: ' || target.closest(selector) !== null) return', replace: ') return' }],
    tests,
  },
  {
    name: 'the keyboard is not followed',
    edits: [{ file, find: "  container.addEventListener('focusin', focus)", replace: '' }],
    tests,
  },
  {
    name: 'jsdom fails the Mount',
    edits: [
      {
        file,
        find: "typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(soon)",
        replace: 'new ResizeObserver(soon)',
      },
    ],
    tests: ['packages/primitives/test/fluid-hover.test.ts'],
  },
]
