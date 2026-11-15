/**
 * A drop lands where the release aimed (`DragDropped`'s `aim`), not where the
 * last move was over: `pnpm mutate packages/builder/test/dropAim.mutations.ts`.
 */
const builder = '../src/index.ts'
const tests = ['packages/builder/test/builder.test.ts']

export default [
  {
    name: 'the release’s aim is ignored',
    edits: [{ file: builder, find: 'message.aim === undefined', replace: 'true' }],
    tests,
  },
  {
    name: 'a release over nothing keeps the last move’s place',
    edits: [
      {
        file: builder,
        find: 'OverNothing: () => draggedOff(model),',
        replace: 'OverNothing: () => model,',
      },
    ],
    tests,
  },
  {
    name: 'a release over a node takes its zone from the last move',
    edits: [
      {
        file: builder,
        find: 'OverNode: ({ id, zone }) => draggedOver(model, id, zone, Option.none()).model,',
        replace: "OverNode: ({ id }) => draggedOver(model, id, 'before', Option.none()).model,",
      },
    ],
    tests,
  },
]
