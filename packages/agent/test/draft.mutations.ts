/**
 * Save correlation and the projection boundary: `pnpm mutate packages/agent/test/draft.mutations.ts`.
 */
const app = './draftApp.ts'
const parts = ['packages/agent/test/parts.test.ts']
const draft = ['packages/agent/test/draft.test.ts']

export default [
  {
    name: 'overlapping saves complete on the first result',
    edits: [
      {
        file: app,
        find: 'correlate: (request, result) => request.requestId === result.requestId,',
        replace: 'correlate: (request, result) => true,',
      },
    ],
    tests: draft,
  },
  {
    name: 'the encoded context includes the token',
    edits: [
      {
        file: app,
        find: 'const Shown = Schema.Struct({\n  query: Schema.String,\n  draft: Schema.String,\n})',
        replace:
          'const Shown = Schema.Struct({\n  query: Schema.String,\n  draft: Schema.String,\n  token: Schema.String,\n})',
      },
      {
        file: app,
        find: 'model => ({ query: model.query, draft: model.draft })',
        replace: 'model => ({ query: model.query, draft: model.draft, token: model.token })',
      },
    ],
    tests: parts,
  },
  {
    name: 'the save button names itself apart from its part',
    edits: [
      {
        file: './draftView.ts',
        find: "h.AriaLabel(partCatalog.part('draft.save').label)",
        replace: "h.AriaLabel('Save draft')",
      },
    ],
    tests: ['packages/agent/test/draft.browser.test.ts'],
  },
]
