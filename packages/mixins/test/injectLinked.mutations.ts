/**
 * The injector's reading of a linked stylesheet, broken:
 * `pnpm mutate packages/mixins/test/injectLinked.mutations.ts`.
 */
const tests = ['packages/mixins/test/injectLinked.browser.test.ts']

export default [
  {
    name: 'a link’s classes are not read',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'for (const sheet of linked) classesIn(rulesOf(sheet), present)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a draw does not wait for a link that is loading',
    edits: [
      { file: '../src/inject.ts', find: 'if (into.waiting.length > 0) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'a link that failed is waited for for good',
    edits: [{ file: '../src/inject.ts', find: 'failed.add(link)', replace: '' }],
    survives:
      'Chromium gives a link that failed an empty sheet, so it is never waited for; the spec leaves the sheet null, which only the failed mark ends',
    tests,
  },
  {
    name: 'a global rule the link holds is written again',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'return rules.length > 0 && rules.every(rule => held.has(rule.cssText))',
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'a global rule the link lacks is taken as held',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'return rules.length > 0 && rules.every(rule => held.has(rule.cssText))',
        replace: 'return true',
      },
    ],
    tests,
  },
] as const
