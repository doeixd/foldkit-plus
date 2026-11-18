export default [
  {
    name: 'a larger page size keeps the page number',
    edits: [
      {
        file: '../src/examples/pagination/range.ts',
        find: 'page: Math.floor(((model.page - 1) * model.perPage) / perPage) + 1,',
        replace: 'page: model.page,',
      },
    ],
    tests: ['examples/site/test/paginationExamples.test.ts'],
  },
]
