/** `Cms.bySlug`, broken in turn: `pnpm mutate packages/cms/test/bySlug.mutations.ts`. */
const tests = ['packages/cms/test/bySlug.test.ts']

export default [
  {
    name: 'content with no slug role is searched by an address it lacks',
    edits: [
      { file: '../src/index.ts', find: 'if (address === undefined) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'the query is named after something else than the content',
    edits: [
      { file: '../src/index.ts', find: '`${content.name}BySlug` as', replace: "'BySlug' as" },
    ],
    tests,
  },
]
