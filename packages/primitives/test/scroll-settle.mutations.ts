/**
 * `ScrollSettle`, broken in turn:
 * `pnpm mutate packages/primitives/test/scroll-settle.mutations.ts`.
 */
const browser = 'packages/primitives/test/scroll-settle.browser.test.ts'

export default [
  {
    name: 'right to left reads the start from the left',
    edits: [
      {
        file: '../src/dom/scroll-settle.ts',
        find: "return style.direction === 'rtl'",
        replace: 'return false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the start is not scrolled to at insert',
    edits: [
      {
        file: '../src/dom/scroll-settle.ts',
        find: 'if (start > 0 && first !== undefined) {',
        replace: 'if (start > 99 && first !== undefined) {',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the nearest is the last one looked at',
    edits: [
      {
        file: '../src/dom/scroll-settle.ts',
        find: 'if (away < distance) {',
        replace: 'if (away >= 0) {',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a settled scroll is not heard',
    edits: [
      {
        file: '../src/dom/scroll-settle.ts',
        find: 'element.addEventListener(type, listener)',
        replace: 'void type',
      },
    ],
    tests: [browser],
  },
  {
    name: 'nothing is reported at insert',
    edits: [
      {
        file: '../src/dom/scroll-settle.ts',
        find: 'if (element.scrollLeft + element.scrollTop === before) report()',
        replace: 'void before',
      },
    ],
    tests: [browser],
  },
]
