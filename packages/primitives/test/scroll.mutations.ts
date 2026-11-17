/**
 * `keepScroll`, broken in turn: `pnpm mutate packages/primitives/test/scroll.mutations.ts`.
 */
const file = '../src/dom/scroll.ts'
const tests = ['packages/primitives/test/scroll.browser.test.ts']

export default [
  {
    name: 'the offset is not written as the page is left',
    edits: [{ file, find: "  on(window, 'beforeunload', persist)\n", replace: '' }],
    tests,
  },
  {
    name: 'a restore holds for the whole ceiling instead of ending when the page stands still',
    edits: [
      { file, find: '        if (still >= 2) {', replace: '        if (still >= Infinity) {' },
    ],
    tests,
  },
  {
    name: 'an element scroller is read as the window',
    edits: [
      {
        file,
        find: '    if (scroller === undefined)\n      return Option.some({',
        replace: '    if (true)\n      return Option.some({',
      },
    ],
    tests,
  },
  {
    name: 'Back is not remembered as it begins',
    edits: [
      {
        file,
        find: "    if (Option.contains(navigationTypeOf(event), 'traverse')) remember()",
        replace: '    if (Option.contains(navigationTypeOf(event), "traverse")) {}',
      },
      {
        file,
        find: "  for (const input of ['click', 'keydown']) on(window, input, acted, true)",
        replace: '',
      },
    ],
    tests,
  },
]
