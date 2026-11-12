/**
 * `visibleLinks` and the shared opt-out, broken in turn:
 * `pnpm mutate packages/primitives/test/visible-links.mutations.ts` checks
 * that a test fails for every one. The browser tests cannot run under
 * `pnpm mutate` while the local Chromium is older than Playwright's.
 */
const unit = ['packages/primitives/test/pointed-links.test.ts']
const tests = [
  ...unit,
  'packages/primitives/test/visible-links.browser.test.ts',
  'packages/primitives/test/pointed-links.browser.test.ts',
]
const file = '../src/dom/visible-links.ts'

export default [
  {
    name: 'the cap is ignored',
    edits: [{ file, find: 'if (read.size >= atMost) return', replace: '' }],
    tests,
  },
  {
    name: 'a link already read is read again',
    edits: [{ file, find: 'if (read.has(link.href)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a read link keeps being observed and is counted twice',
    edits: [
      {
        file,
        find: '            read.add(link.href)\n            observer.unobserve(link)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Save-Data does not stop it',
    edits: [{ file, find: 'connection?.saveData === true ||', replace: '' }],
    tests,
  },
  {
    name: 'a slow connection does not stop it',
    edits: [{ file, find: "connection?.effectiveType === '2g'", replace: 'false' }],
    tests,
  },
  {
    name: 'a hidden tab does not stop it',
    edits: [{ file, find: " || document.visibilityState === 'hidden'", replace: '' }],
    tests,
  },
  {
    name: 'a link out of view is read',
    edits: [{ file, find: 'if (!entry.isIntersecting) continue', replace: '' }],
    tests,
  },
  {
    name: 'a new page does not count the cap again',
    edits: [{ file, find: '          if (here !== page) {', replace: '          if (false) {' }],
    tests,
  },
  {
    name: 'a link added later is not seen',
    edits: [
      { file, find: 'added.observe(document, { childList: true, subtree: true })', replace: '' },
    ],
    tests,
  },
  {
    name: 'the margin is dropped',
    edits: [{ file, find: "rootMargin: options.margin ?? '0px'", replace: "rootMargin: '0px'" }],
    tests,
  },
  {
    name: 'a link marked data-preload="none" is read',
    edits: [
      {
        file: '../src/dom/preload-link.ts',
        find: " &&\n    link.dataset['preload'] !== 'none'",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the stream keeps observing after it ends',
    survives:
      'the closed queue drops what a leaked observer offers, so nothing a test can see; the observer is released with the scope',
    edits: [{ file, find: '          observer.disconnect()\n', replace: '' }],
    tests,
  },
]
