/**
 * Edge scrolling and the marquee, each part broken in turn: `pnpm mutate
 * packages/primitives/test/edgeScroll.mutations.ts` checks that a test fails for every one.
 */
const scroll = '../src/dom/edge-scroll.ts'
const drag = '../src/dom/pointer-drag.ts'
const marquee = '../src/dom/marquee.ts'
const edgeTests = [
  'packages/primitives/test/edgeScroll.browser.test.ts',
  'packages/primitives/test/audit-reorder.browser.test.ts',
]
const marqueeTests = ['packages/primitives/test/marquee.browser.test.ts']

export default [
  {
    name: 'the strip is the whole box, so a pointer mid-box scrolls',
    edits: [{ file: scroll, find: 'if (at < lo + strip) return', replace: 'if (at < hi) return' }],
    tests: edgeTests,
  },
  {
    name: 'a strip wider than a third of a small box overlaps its other edge',
    edits: [{ file: scroll, find: 'Math.min(band, (hi - lo) / 3)', replace: 'band' }],
    tests: edgeTests,
  },
  {
    name: 'the speed does not grow with depth in the strip',
    edits: [
      {
        file: scroll,
        find: 'if (at > hi - strip) return Math.min(1, (at - (hi - strip)) / strip)',
        replace: 'if (at > hi - strip) return 1',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'a scroller already at its end is still chosen, so the page never takes over',
    edits: [
      {
        file: scroll,
        find: 'if (by < 0 ? at <= 0 : at >= room(scroller.element, axis) - 0.5) continue',
        replace: '',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'a smooth-scrolling page glides each step',
    edits: [
      {
        file: scroll,
        find: "{ top: before + by * speed * seconds, behavior: 'instant' }",
        replace: "{ top: before + by * speed * seconds, behavior: 'auto' }",
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'reduced motion glides',
    edits: [
      {
        file: scroll,
        find: "view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true",
        replace: 'false',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'the loop never ends when nothing can scroll',
    edits: [
      {
        file: scroll,
        find: 'if (steps.length === 0) return',
        replace: 'if (steps.length === 0) { frame = view?.requestAnimationFrame(tick); return }',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'the loop outlives the drag',
    edits: [
      {
        file: drag,
        find: '            scroller?.stop()\n            const id = dragging',
        replace: '            const id = dragging',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'the loop outlives the Mount',
    edits: [
      {
        file: drag,
        find: '            clearTimeout(holding)\n            scroller?.stop()\n            release()',
        replace: '            clearTimeout(holding)\n            release()',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'the place under a still pointer is not reported after a scroll',
    edits: [
      { file: drag, find: 'if (dragging !== null && heard !== null) report(heard)', replace: '' },
    ],
    tests: edgeTests,
  },
  {
    name: 'a drag scrolls without being asked',
    edits: [
      {
        file: drag,
        find: 'edgeScroll === undefined\n              ? undefined',
        replace: 'false\n              ? undefined',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'the pointer is not handed to the scroller',
    edits: [
      {
        file: drag,
        find: '                scroller?.move(positioned.clientX ?? 0, positioned.clientY ?? 0)\n',
        replace: '',
      },
    ],
    tests: edgeTests,
  },
  {
    name: 'a finger starts a lasso',
    edits: [{ file: marquee, find: " || down.pointerType === 'touch'", replace: '' }],
    tests: marqueeTests,
  },
  {
    name: 'a press on a marked node starts a lasso',
    edits: [
      {
        file: marquee,
        find: 'if (marked !== null && element.contains(marked)) return',
        replace: '',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a press on a control starts a lasso',
    edits: [{ file: marquee, find: 'if (target.closest(CONTROLS) !== null) return', replace: '' }],
    tests: marqueeTests,
  },
  {
    name: 'a press on the scrollbar starts a lasso',
    edits: [{ file: marquee, find: 'element.clientWidth > 0 &&', replace: 'false &&' }],
    tests: marqueeTests,
  },
  {
    name: 'a press that hardly moves is a lasso',
    edits: [
      {
        file: marquee,
        find: '                    DRAG_THRESHOLD\n',
        replace: '                    0\n',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a second pointer takes over the press',
    edits: [
      { file: marquee, find: 'if (pressed !== null || (down.button', replace: 'if ((down.button' },
    ],
    tests: marqueeTests,
  },
  {
    name: 'the rectangle ignores what scrolled',
    edits: [
      {
        file: marquee,
        find: 'top: box.top + element.clientTop - element.scrollTop,',
        replace: 'top: box.top + element.clientTop,',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'the rectangle leaves the container',
    edits: [
      {
        file: marquee,
        find: 'const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)',
        replace: 'const clamp = (value: number, _max: number) => value',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a node the lasso only meets at an edge is touched',
    edits: [
      { file: marquee, find: 'x < rect.x + rect.width &&', replace: 'x <= rect.x + rect.width &&' },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a node above the lasso is touched',
    edits: [{ file: marquee, find: 'y + box.height > rect.y', replace: 'y + box.height >= 0' }],
    tests: marqueeTests,
  },
  {
    name: 'Escape ends the lasso as a drop',
    edits: [
      {
        file: marquee,
        find: '                () => end(false),\n              ),\n              true,',
        replace: '                () => end(true),\n              ),\n              true,',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'the click a lasso ends with reaches the page',
    edits: [
      { file: marquee, find: 'swallowClick = ended && inside', replace: 'swallowClick = false' },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a lasso swallows the next click too',
    edits: [
      {
        file: marquee,
        find: '                swallowClick = false\n                event.preventDefault()',
        replace: '                event.preventDefault()',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'an additive press is not told so',
    edits: [
      {
        file: marquee,
        find: 'down.shiftKey === true || down.ctrlKey === true || down.metaKey === true',
        replace: 'down.shiftKey === true || down.ctrlKey === true',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'a Mount ended mid-press keeps the document listeners',
    edits: [
      {
        file: marquee,
        find: '          const stop = () => {\n            scroller?.stop()\n            release()\n          }',
        replace: '          const stop = () => {\n            scroller?.stop()\n          }',
      },
    ],
    tests: marqueeTests,
  },
  {
    name: 'the lasso scrolls without being asked',
    edits: [
      {
        file: marquee,
        find: 'edgeScroll === undefined ? undefined : edgeScroller(element, edgeScroll, report)',
        replace: 'edgeScroller(element, edgeScroll ?? {}, report)',
      },
    ],
    tests: marqueeTests,
  },
]
