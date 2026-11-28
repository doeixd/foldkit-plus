const keep = '../src/keep.ts'
const tests = ['packages/ssr/test/keepState.test.ts']

export default [
  {
    name: 'restorePageState drops scroll offset restoration',
    edits: [
      {
        file: keep,
        find: '  for (const { element, scrollTop, scrollLeft } of held.scrolls) {',
        replace:
          '  for (const { element, scrollTop, scrollLeft } of ([] as typeof held.scrolls)) {',
      },
    ],
    tests,
  },
  {
    name: 'restorePageState drops <details> open state restoration',
    edits: [
      {
        file: keep,
        find: '  for (const { element, open } of held.details) {',
        replace: '  for (const { element, open } of ([] as typeof held.details)) {',
      },
    ],
    tests,
  },
  {
    name: 'restorePageState drops binder-touched control restoration',
    edits: [
      {
        file: keep,
        find: '  for (const { element, field, attributes } of held.binderTouched) {',
        replace:
          '  for (const { element, field, attributes } of ([] as typeof held.binderTouched)) {',
      },
    ],
    tests,
  },
]
