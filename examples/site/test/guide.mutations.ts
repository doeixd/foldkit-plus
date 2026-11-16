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
    name: 'a page that asked for no room gets it',
    edits: [{ file, find: ':not([data-reserve="false"])', replace: '' }],
    tests,
  },
  {
    name: 'a top corner is drawn at the bottom',
    edits: [
      {
        file,
        find: String.raw`'&[data-corner="top-end"]', {
        insetBlockStart: 'var(--demo-guide-inset, 1rem)',`,
        replace: String.raw`'&[data-corner="top-end"]', {
        insetBlockStart: 'auto',`,
      },
    ],
    tests,
  },
  {
    name: 'the compact pill keeps its width',
    edits: [
      {
        file,
        find: `width: '2.25rem',
        padding: '0',`,
        replace: `padding: '0',`,
      },
    ],
    tests,
  },
  {
    name: 'the guide’s links are only as tall as their words',
    edits: [{ file, find: "minBlockSize: '1.5rem',", replace: '' }],
    tests,
  },
]
