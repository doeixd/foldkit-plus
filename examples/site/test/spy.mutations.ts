/**
 * The sidebar's scrollspy, broken in turn: `pnpm mutate examples/site/test/spy.mutations.ts`.
 * `e2e/spy.e2e.ts` drives the built page, which `pnpm mutate` does not run; these
 * are held by the pure reading (`spy.test.ts`) and the browser test over a page
 * of its own (`spy.browser.test.ts`).
 */
const file = '../src/spy.ts'
const unit = ['examples/site/test/spy.test.ts']
const browser = ['examples/site/test/spy.browser.test.ts']

export default [
  {
    name: 'the end of the page no longer marks the last section',
    edits: [{ file, find: 'if (atEnd) return', replace: 'if (atEnd && false) return' }],
    tests: unit,
  },
  {
    name: 'a heading just under the lead line counts',
    edits: [{ file, find: 'top <= lead', replace: 'top <= lead + 5' }],
    tests: unit,
  },
  {
    name: 'a heading at the lead line does not count',
    edits: [{ file, find: 'top <= lead', replace: 'top < lead' }],
    tests: unit,
  },
  {
    name: 'a link that is no longer the reader’s keeps its mark',
    edits: [{ file, find: "else link.removeAttribute('aria-current')", replace: 'else void 0' }],
    tests: browser,
  },
  {
    name: 'the stream does not begin by clearing the last page’s mark',
    edits: [{ file, find: 'Stream.make(Option.none<string>())', replace: 'Stream.empty' }],
    tests: browser,
  },
  {
    name: 'the scroll is not listened to',
    edits: [
      {
        file,
        find: "window.addEventListener('scroll', schedule, { passive: true })",
        replace: '',
      },
    ],
    tests: browser,
  },
]
