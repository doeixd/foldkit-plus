/**
 * The phone audit, broken in turn: `pnpm mutate examples/site/test/phoneAudit.mutations.ts`.
 */
const file = '../src/phoneAudit.ts'
const tests = ['examples/site/test/phoneAudit.browser.test.ts']
const verdict = 'big(rect) || inline(target) || labelled(target) || spaced(target, rect)'

export default [
  {
    name: 'a target need only be 16px',
    edits: [{ file, find: 'const MIN = 24', replace: 'const MIN = 16' }],
    tests,
  },
  {
    name: 'no spacing exception',
    edits: [{ file, find: verdict, replace: 'big(rect) || inline(target) || labelled(target)' }],
    tests,
  },
  {
    name: 'no inline exception',
    edits: [
      { file, find: verdict, replace: 'big(rect) || labelled(target) || spaced(target, rect)' },
    ],
    tests,
  },
  {
    name: 'no label exception',
    edits: [
      { file, find: verdict, replace: 'big(rect) || inline(target) || spaced(target, rect)' },
    ],
    tests,
  },
  {
    name: 'a visually hidden control is a target',
    edits: [
      {
        file,
        find: 'return rect.width > 1 && rect.height > 1',
        replace: 'return rect.width > 0 && rect.height > 0',
      },
    ],
    tests,
  },
  {
    name: 'nothing overflows',
    edits: [
      {
        file,
        find: 'overflow: root.scrollWidth - root.clientWidth',
        replace: 'overflow: 0',
      },
    ],
    tests,
  },
]
