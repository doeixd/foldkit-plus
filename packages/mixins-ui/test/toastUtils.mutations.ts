/**
 * The vendored toast utils, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toastUtils.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/toastUtils.test.ts']

export default [
  {
    name: 'buttons may start swipes',
    edits: [
      {
        file: '../src/toastUtils.ts',
        find: "'button, a, input, select, textarea, [contenteditable], [role=\"button\"], [role=\"link\"]'",
        replace: "'a, input, select, textarea, [contenteditable], [role=\"button\"], [role=\"link\"]'",
      },
    ],
    tests,
  },
  {
    name: 'marked text swipes for every pointer',
    edits: [
      {
        file: '../src/toastUtils.ts',
        find: "return pointerType !== 'touch' && element.closest('[data-toast-swipe-ignore]') !== null",
        replace: "return element.closest('[data-toast-swipe-ignore]') !== null",
      },
    ],
    tests,
  },
  {
    name: 'nothing is ever excluded',
    edits: [
      {
        file: '../src/toastUtils.ts',
        find: 'if (element.closest(SWIPE_EXCLUDED_TARGET_SELECTOR) !== null) {\n    return true\n  }',
        replace: 'if (element.closest(SWIPE_EXCLUDED_TARGET_SELECTOR) !== null) {\n    return false\n  }',
      },
    ],
    tests,
  },
]
