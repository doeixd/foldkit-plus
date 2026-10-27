/**
 * The demo guide, broken in turn: `pnpm mutate examples/site/test/guide.mutations.ts`.
 */
const file = '../src/guide.ts'
const tests = ['examples/site/test/guide.browser.test.ts']

export default [
  {
    name: 'the pill covers the page’s last lines on a phone',
    edits: [{ file, find: "blockSize: '4.25rem',", replace: "blockSize: '0'," }],
    tests,
  },
  {
    name: 'the room is left at every width',
    edits: [{ file, find: "'@media (max-width: 48rem)',", replace: "'@media all'," }],
    tests,
  },
  {
    name: 'the guide’s links are only as tall as their words',
    edits: [{ file, find: "minBlockSize: '1.5rem',", replace: '' }],
    tests,
  },
]
