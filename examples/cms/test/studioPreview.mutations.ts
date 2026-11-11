/**
 * The editor's preview, broken in turn:
 * `pnpm mutate examples/cms/test/studioPreview.mutations.ts` checks that a test
 * fails for every one.
 */
export default [
  {
    name: 'a preview nothing has asked yet reads as an empty draft',
    edits: [
      {
        file: '../src/views/view.ts',
        find: "Initial: () => Loading.view(slots.muted, h, 'Loading…'),",
        replace: 'Initial: nothing,',
      },
    ],
    tests: ['examples/cms/test/studioEditor.test.ts'],
  },
]
