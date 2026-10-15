/**
 * The editor's chords and the ones a placement adds, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/keymap.mutations.ts` checks that a test fails for every one.
 */
const tests = [
  'packages/richtext-dom/test/events.test.ts',
  'packages/richtext-dom/test/editor.test.ts',
  'packages/richtext-dom/test/editor-bundle.test.ts',
]

export default [
  {
    name: 'Strikethrough has no chord',
    edits: [
      {
        file: '../src/events.ts',
        find: "      return event.shiftKey ? 'Strikethrough' : undefined",
        replace: '      return undefined',
      },
    ],
    tests,
  },
  {
    name: 'Ctrl+S strikes through',
    edits: [
      {
        file: '../src/events.ts',
        find: "      return event.shiftKey ? 'Strikethrough' : undefined",
        replace: "      return 'Strikethrough'",
      },
    ],
    tests,
  },
  {
    name: 'the mount reads no placed chords',
    edits: [
      {
        file: '../src/editor.ts',
        find: '            keymap: keymapFor(element.id),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an attached editor is given no chords',
    edits: [{ file: '../src/editor.ts', find: '      keymap: drawing.keymap,\n', replace: '' }],
    tests,
  },
  {
    name: 'a placement keeps the last one’s chords',
    edits: [
      {
        file: '../src/editor-bundle.ts',
        find: '  placeKeymap(hostId, placement.keymap ?? [])\n',
        replace: '  if (placement.keymap !== undefined) placeKeymap(hostId, placement.keymap)\n',
      },
    ],
    tests,
  },
]
