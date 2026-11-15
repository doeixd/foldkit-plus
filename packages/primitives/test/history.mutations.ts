/**
 * History's no-op, pause and map edges, broken in turn: `pnpm mutate
 * packages/primitives/test/history.mutations.ts`.
 */
const file = '../src/state/history.ts'
const tests = ['packages/primitives/test/history.test.ts']

export default [
  {
    name: 'an equal push still records',
    edits: [
      {
        file,
        find: 'if (options.equals?.(model.present, value) === true) return model',
        replace: 'if (options.equals?.(model.present, value) === true) return { ...model }',
      },
    ],
    tests,
  },
  {
    name: 'a pause no longer ends the step',
    edits: [{ file, find: 'at - last < within', replace: 'true' }],
    tests,
  },
  {
    name: 'a window is measured from the first push of the group',
    edits: [
      {
        file,
        find: 'return { ...model, present: value, future: noFuture(model), groupedAt }',
        replace: 'return { ...model, present: value, future: noFuture(model) }',
      },
    ],
    tests,
  },
  {
    name: 'a push with no time joins a window',
    edits: [
      {
        file,
        find: '(at !== undefined && Option.exists(',
        replace: '(at === undefined || Option.exists(',
      },
    ],
    tests,
  },
  {
    name: 'map hands back a copy when nothing changed',
    edits: [
      {
        file,
        find: 'return same ? model : { ...model, past, present, future }',
        replace: 'return { ...model, past, present, future }',
      },
    ],
    tests,
  },
  {
    name: 'map leaves the future as it was',
    edits: [
      {
        file,
        find: 'const future = model.future.map(change)',
        replace: 'const future = model.future',
      },
    ],
    tests,
  },
]
