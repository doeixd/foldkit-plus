/**
 * The tags input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tagsInput.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/tagsInput.test.ts'

export default [
  {
    name: 'the delimiter key does not commit',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "key === 'Enter' || key === model.delimiter",
        replace: "key === 'Enter'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a tag keeps the spaces around it',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '.map(part => part.trim())',
        replace: '.map(part => part)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a draft adds the same tag twice',
    edits: [{ file: '../src/tagsInput.ts', find: '      seen.add(part)\n', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a draft refused whole is cleared',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'return fresh.length === 0 ? tags : [...tags, ...fresh]',
        replace: 'return [...tags, ...fresh]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Backspace takes the last tag while the draft has text',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "key === 'Backspace' && model.draft === '' && model.tags.length > 0",
        replace: "key === 'Backspace' && model.tags.length > 0",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal leaves the focus on a button that is gone',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'commands: [FocusInput({ id: model.id })],',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal focuses the element named by the bare id',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'Dom.focus(`#${inputId(id)}`)',
        replace: 'Dom.focus(`#${id}`)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every remove button removes the first tag',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'h.OnClick(lift(Message.Removed({ tag })))',
        replace: 'h.OnClick(lift(Message.Removed({ tag: model.tags[0]! })))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled field still takes keys',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '...(disabled\n            ? [h.Disabled(true)]\n            : [\n',
        replace: '...(false\n            ? [h.Disabled(true)]\n            : [\n',
      },
    ],
    tests: [unit],
  },
]
