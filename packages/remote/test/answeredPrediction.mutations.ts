/**
 * A write's answer reads back what its own prediction showed, and the law
 * holds the client to the server once the answer lands (#265), and a write
 * asks for what its row foresees (#370), broken in turn:
 * `pnpm mutate packages/remote/test/answeredPrediction.mutations.ts`.
 */
const shown = '../src/shown.ts'
const index = '../src/index.ts'
const law = '../src/law.ts'
const mutation = '../src/mutation.ts'
const laws = [
  'packages/remote-drizzle/test/law.test.ts',
  'examples/reference/test/law.test.ts',
  'examples/chirp/test/law.test.ts',
]
const shownTests = [
  'packages/remote/test/mutationAnswer.test.ts',
  'packages/remote/test/write.test.ts',
  'packages/remote/test/outbox.test.ts',
  ...laws,
]

const foreseenTests = [
  'packages/remote/test/mutationAnswer.test.ts',
  'examples/reference/test/notebook.test.ts',
]

export default [
  {
    name: 'a write does not ask for what its row foresees',
    edits: [{ file: shown, find: '  for (const slice of foreseen) add(slice)\n', replace: '' }],
    tests: foreseenTests,
  },
  {
    name: 'a write is sent without its row’s foreseen members',
    edits: [
      {
        file: index,
        find: 'write === undefined ? [] : foreseenOfWrite(write),',
        replace: '[],',
      },
    ],
    tests: foreseenTests,
  },
  {
    name: 'a create asks for nothing its row foresees',
    edits: [{ file: mutation, find: 'Insert: foreseen,', replace: 'Insert: () => [],' }],
    tests: foreseenTests,
  },
  {
    name: 'an edit asks for nothing its row foresees',
    edits: [{ file: mutation, find: 'Update: foreseen,', replace: 'Update: () => [],' }],
    tests: foreseenTests,
  },
  {
    name: 'a delete asks for what the row it removes foresees',
    edits: [{ file: mutation, find: 'Delete: () => [] }', replace: 'Delete: foreseen }' }],
    tests: foreseenTests,
  },
  {
    name: 'a write sends only what the active Surfaces read, not what it shows itself',
    edits: [
      {
        file: shown,
        find: 'for (const patch of predicted.filter(isPatch))',
        replace: 'for (const patch of [])',
      },
    ],
    tests: shownTests,
  },
  {
    name: 'a patch’s added fields are not shown',
    edits: [{ file: shown, find: '  ...Object.keys(patch.adds ?? {}),\n', replace: '' }],
    tests: shownTests,
  },
  {
    name: 'a patch’s computed fields are not shown',
    edits: [{ file: shown, find: '  ...Object.keys(patch.computes ?? {}),\n', replace: '' }],
    tests: shownTests,
  },
  {
    name: 'every operation counts as a patch',
    edits: [{ file: shown, find: "  !('_tag' in operation)", replace: '  true' }],
    tests: shownTests,
  },
  {
    name: 'a durable write stores only what the active Surfaces read',
    edits: [
      {
        file: index,
        find: 'shown: shownAt(model, optimistic ?? [], mutation.write),',
        replace: 'shown: shownAt(model, [], mutation.write),',
      },
    ],
    tests: ['packages/remote/test/outbox.test.ts'],
  },
  {
    name: 'a write sent at once sends only what the active Surfaces read',
    edits: [
      {
        file: index,
        find: 'shown: shownAt(startedModel, optimistic ?? [], mutation.write),',
        replace: 'shown: shownAt(startedModel, [], mutation.write),',
      },
    ],
    tests: shownTests,
  },
  {
    name: 'the law compares no field once answered',
    edits: [
      {
        file: law,
        find: "compare(part, kept.values[field], stored.values[field], 'answered')",
        replace: 'void 0',
      },
    ],
    tests: laws,
  },
  {
    name: 'the law asks no row whether it is there once answered',
    edits: [
      {
        file: law,
        find: "if (kept !== undefined) compare(key, !kept.tombstone, stored !== undefined, 'answered')",
        replace: '',
      },
    ],
    tests: laws,
  },
  {
    name: 'the law compares no list once answered',
    edits: [
      {
        file: law,
        find: "compare(ref.identity, ids(Data.visibleItems(kept, ref.identity)), served, 'answered')",
        replace: 'void 0',
      },
    ],
    tests: laws,
  },
  {
    name: 'a part wrong once answered still counts as agreed',
    edits: [
      {
        file: law,
        find: 'agreed: [...new Set(agreed)].filter(part => !wrong.has(part))',
        replace: 'agreed: [...new Set(agreed)]',
      },
    ],
    tests: laws,
  },
  {
    name: 'a field the answer left to be read again is compared as missing',
    edits: [
      {
        file: law,
        find: 'if (kept !== undefined && !kept.tombstone && kept.present.has(field))',
        replace: 'if (kept !== undefined && !kept.tombstone)',
      },
    ],
    tests: laws,
  },
]
