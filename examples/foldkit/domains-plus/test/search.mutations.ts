/**
 * The search text, its address and the debounce (phase 1), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/search.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/search.test.ts']

export default [
  {
    name: "the mirror's echo goes through the debounce again",
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'if (model.search.latest === model.query) return { model: routed }',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Escape leaves the label read until the debounce settles',
    edits: [
      {
        file: '../src/client/app.ts',
        find: "typed(modifyFields(model, { query: () => '', settledLabel: () => Option.none() }), '')",
        replace: "typed(modifyFields(model, { query: () => '' }), '')",
      },
    ],
    tests,
  },
  {
    name: 'Enter waits for the debounce',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'model: modifyFields(model, { settledLabel: () => queryToMaybeDomainLabel(model.query) }),',
        replace: 'model,',
      },
    ],
    tests,
  },
  {
    name: 'a page opened at ?q= waits for a keystroke to read',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'settledLabel: queryToMaybeDomainLabel(query),',
        replace: 'settledLabel: Option.none(),',
      },
    ],
    tests,
  },
]
