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
        find: '            if (!keyed()) hide()',
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
  {
    name: 'the highlight ignores the mark',
    edits: [{ file, find: 'if (follows === undefined) return', replace: 'if (true) return' }],
    tests,
  },
  {
    name: 'the highlight stays when the mark goes',
    edits: [
      {
        file,
        find: 'else if (pointer === null && !keyed()) hide()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a fresh highlight grows from nowhere',
    edits: [
      {
        file,
        find: 'const grows = appearing ? origin() : null',
        replace: 'const grows = null as Element | null',
      },
    ],
    tests,
  },
  {
    name: 'a fading highlight returns to where it grew from',
    edits: [
      {
        file,
        find: "const hide = () => container.style.setProperty(property.shown, '0')",
        replace:
          "const hide = () => (place(origin()), container.style.setProperty(property.shown, '0'))",
      },
    ],
    tests,
  },
  {
    name: 'the container is not marked while the highlight runs',
    edits: [{ file, find: 'container.setAttribute(FLUID_HOVER_ATTRIBUTE, name)', replace: '' }],
    tests,
  },
  {
    name: 'a click’s focus keeps the highlight after the pointer leaves',
    edits: [
      {
        file,
        find: "focused !== null && container.contains(focused) && focused.matches(':focus-visible')",
        replace: 'focused !== null && container.contains(focused)',
      },
    ],
    tests,
  },
  {
    name: 'a gap click presses however far out it lands',
    edits: [
      {
        file,
        find: '            if (gapReach !== undefined && reach > gapReach) return',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an item with no layout box places the highlight at zero',
    edits: [
      {
        file,
        find: '            if (rect.width === 0 && rect.height === 0) {',
        replace: '            if (false) {',
      },
    ],
    tests,
  },
]
