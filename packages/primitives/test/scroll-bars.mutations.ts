/**
 * `ScrollBars`, broken in turn:
 * `pnpm mutate packages/primitives/test/scroll-bars.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/scroll-bars.browser.test.ts']
const file = '../src/dom/scroll-bars.ts'

export default [
  {
    name: 'the thumb is as long whatever the view',
    edits: [
      {
        file,
        find: 'const size = Math.min(track, Math.max(SHORTEST, (track * view) / content))',
        replace: 'const size = SHORTEST',
      },
    ],
    tests,
  },
  {
    name: 'a long content shrinks the thumb past a target',
    edits: [{ file, find: 'Math.max(SHORTEST, ', replace: 'Math.max(0, ' }],
    tests,
  },
  {
    name: 'the thumb stays put as the box scrolls',
    edits: [
      {
        file,
        find: 'const offset = ((track - size) * start) / (content - view)',
        replace: 'const offset = 0',
      },
    ],
    tests,
  },
  {
    name: 'a right-to-left scroll counts from the left',
    edits: [
      {
        file,
        find: 'start: rtl ? room + scroller.scrollLeft : scroller.scrollLeft,',
        replace: 'start: scroller.scrollLeft,',
      },
    ],
    tests,
  },
  {
    name: 'the bars never hide',
    edits: [
      {
        file,
        find: "            for (const bar of bars()) mark(bar, 'data-shown', false)\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pointer resting on a bar does not hold it',
    edits: [
      {
        file,
        find: 'if (resting !== null || dragging !== null) return',
        replace: 'if (dragging !== null) return',
      },
    ],
    tests,
  },
  {
    name: 'leaving after a held hide leaves the bars shown',
    edits: [
      {
        file,
        find: '            if (hiding === undefined) hiding = setTimeout(hide, idle)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a dragged thumb is held by its middle',
    edits: [
      {
        file,
        find: 'const grab = onThumb ? at - thumb.offset : thumb.size / 2',
        replace: 'const grab = thumb.size / 2',
      },
    ],
    tests,
  },
  {
    name: 'a drag never ends',
    edits: [{ file, find: '              if (to.pointerId === id) stop()\n', replace: '' }],
    tests,
  },
  {
    name: 'a press off the thumb does not move it',
    edits: [{ file, find: '            if (!onThumb) follow(event)\n', replace: '' }],
    tests,
  },
  {
    name: 'added content is never watched for its size',
    edits: [
      {
        file,
        find: 'if (node instanceof Element && (record.target === scroller || isBar(node))) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'removed content stays watched',
    edits: [
      {
        file,
        find: 'if (node instanceof Element) sizes.unobserve(node)',
        replace: 'if (node instanceof Element) void node',
      },
    ],
    tests,
  },
  {
    name: 'every change watches everything again',
    edits: [
      {
        file,
        find: '            }\n            soon()\n',
        replace:
          '            }\n            for (const child of Array.from(scroller.children)) sizes.observe(child)\n            soon()\n',
      },
    ],
    tests,
  },
  {
    name: 'a coarse pointer gets the overlay',
    edits: [
      {
        file,
        find: "if (typeof matchMedia !== 'function' || !matchMedia(FINE_POINTER).matches) {",
        replace: "if (typeof matchMedia !== 'function') {",
      },
    ],
    tests,
  },
  {
    name: 'ending leaves the bars marked',
    edits: [
      {
        file,
        find: "              for (const name of ['data-scrollable', 'data-shown', 'data-dragging'])\n                bar.removeAttribute(name)\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'it listens before every observer is made',
    edits: [
      {
        file,
        find: "          scroller.addEventListener('scroll', scrolled, { passive: true })\n",
        replace: '',
      },
      {
        file,
        find: '          const sizes = new ResizeObserver(soon)\n',
        replace:
          "          scroller.addEventListener('scroll', scrolled, { passive: true })\n          const sizes = new ResizeObserver(soon)\n",
      },
    ],
    tests: ['packages/primitives/test/scroll-bars.test.ts'],
  },
]
