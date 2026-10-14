/**
 * `Attachment.focus`, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/focus.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/focus.browser.test.ts']

export default [
  {
    name: 'the focus stays outside',
    edits: [{ file, find: '      current.root.focus({ preventScroll: true })\n', replace: '' }],
    tests,
    survives:
      'Chromium focuses a contenteditable when a selection is put in it; the call is for engines that do not, and the browser tests run Chromium only.',
  },
  {
    name: 'a selection out of view stays out of view',
    edits: [
      {
        file,
        find: "element?.scrollIntoView({ block: 'center' })",
        replace: 'element?.getBoundingClientRect()',
      },
    ],
    tests,
  },
  {
    name: 'a selection in view is scrolled to anyway',
    edits: [
      {
        file,
        find: 'if (box.top < 0 || box.bottom > view.innerHeight)',
        replace: 'if (box.top < 0 || box.bottom > view.innerHeight || true)',
      },
    ],
    tests,
  },
]
