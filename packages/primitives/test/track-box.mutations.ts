/**
 * `TrackBox`, broken in turn:
 * `pnpm mutate packages/primitives/test/track-box.mutations.ts`.
 */
const file = '../src/dom/track-box.ts'
const unit = 'packages/primitives/test/track-box.test.ts'
const browser = 'packages/primitives/test/track-box.browser.test.ts'

export default [
  {
    name: 'a percentage is read as pixels',
    edits: [{ file, find: "first.endsWith('%')", replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'a radius past half the shorter side is kept',
    edits: [{ file, find: 'Math.min(pixels, width / 2, height / 2)', replace: 'pixels' }],
    tests: [unit],
  },
  {
    name: 'the radius is written only when it is not asked for',
    edits: [{ file, find: 'if (radius) {', replace: 'if (!radius) {' }],
    tests: [browser],
  },
  {
    name: 'a scroll inside another scroller is not heard',
    edits: [
      {
        file,
        find: "view?.addEventListener('scroll', place, { capture: true, passive: true })",
        replace: "view?.addEventListener('scroll', place, { passive: true })",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the target resizing is not heard',
    edits: [{ file, find: 'if (found !== null) resized.observe(found)', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the old target stays observed',
    edits: [{ file, find: 'if (target !== null) resized.unobserve(target)', replace: '' }],
    tests: [browser],
    survives:
      'each resize places the current target, so an old one still observed only places it again',
  },
  {
    name: 'the document redrawn is not heard',
    edits: [
      {
        file,
        find: 'changed.observe(document, { childList: true, subtree: true })',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: '`data-target` is read once',
    edits: [
      {
        file,
        find: 'attributeFilter: [TRACK_TARGET_ATTRIBUTE],',
        replace: "attributeFilter: ['data-never'],",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a lost target keeps its last box',
    edits: [
      {
        file,
        find: 'for (const property of Object.values(properties)) style.removeProperty(property)',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'every look-up is told, changed or not',
    edits: [
      {
        file,
        find: "if (id !== '' && (told?.target !== id || told.found !== (found !== null))) {",
        replace: "if (id !== '') {",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an empty target is told too',
    edits: [
      {
        file,
        find: "if (id !== '' && (told?.target !== id",
        replace: 'if ((told?.target !== id',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the observers are left connected',
    edits: [{ file, find: '            changed.disconnect()\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the scroll listener is left attached',
    edits: [
      {
        file,
        find: "view?.removeEventListener('scroll', place, { capture: true })",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an observer observes before the last is made',
    edits: [
      {
        file,
        find: '          const resized = new ResizeObserver(place)\n          const changed = new MutationObserver(follow)\n          changed.observe(element, {',
        replace:
          '          const changed = new MutationObserver(follow)\n          changed.observe(element, {',
      },
      {
        file,
        find: '          changed.observe(document, { childList: true, subtree: true })\n',
        replace:
          '          changed.observe(document, { childList: true, subtree: true })\n          const resized = new ResizeObserver(place)\n',
      },
    ],
    tests: [browser],
  },
]
