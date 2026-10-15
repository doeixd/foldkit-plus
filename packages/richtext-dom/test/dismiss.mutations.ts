/**
 * Escape over a slash menu, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/dismiss.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/editor-bundle.ts'
const tests = ['packages/richtext-dom/test/editor-bundle.test.ts']

export default [
  {
    name: 'Enter still chooses after Escape',
    edits: [
      {
        file,
        find: 'slashEntries, menuTextOf(model), model.menuIndex',
        replace: 'slashEntries, textBeforeOf(model), model.menuIndex',
      },
    ],
    tests,
  },
  {
    name: 'a dismissal never ends',
    edits: [
      {
        file,
        find: '      ? { ...result, model: { ...result.model, slashDismissed: Option.none() } }',
        replace: '      ? result',
      },
    ],
    tests,
  },
  {
    name: 'a dismissal ends with any edit, read from the stale document',
    edits: [
      {
        file,
        find: '    const after = { ...result.model, document: committed?.document ?? result.model.document }',
        replace: '    const after = result.model',
      },
    ],
    tests,
  },
  {
    name: 'Escape with no query still writes a dismissal',
    edits: [
      {
        file,
        find: 'return Option.isNone(slash) || dismissed(model)',
        replace: 'return dismissed(model)',
      },
    ],
    tests,
  },
  {
    name: 'any dismissal closes any query',
    edits: [
      {
        file,
        find: 'live => live.node === slash.node && live.offset === slash.offset',
        replace: '() => true',
      },
    ],
    tests,
  },
]
