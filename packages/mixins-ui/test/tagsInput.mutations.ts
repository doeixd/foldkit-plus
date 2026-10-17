/**
 * The tags input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tagsInput.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/tagsInput.test.ts'
const browser = 'packages/mixins-ui/test/tagsInput.browser.test.ts'

export default [
  {
    name: 'the added draft is read again from a frame-old input',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'text.startsWith(added) ? text.slice(added.length) : text',
        replace: 'text',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the added draft is stripped for good',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'added: added => (drawn ? Option.none() : added),',
        replace: 'added: added => added,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a part past max is added',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '} else if (fresh.length === room) {',
        replace: '} else if (false) {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a repeat beside new parts goes unnamed',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'if (Option.isNone(refusal)) refusal = Option.some(Refusal.Repeat({ tag: part }))',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refusal outlives the next edit',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'draft: () => typed,\n              refusal: () => Option.none(),',
        replace: 'draft: () => typed,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refusal does not count',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'refusals: refusals => (Option.isSome(refusal) ? refusals + 1 : refusals),',
        replace: 'refusals: refusals => refusals,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the status region is drawn only as it speaks',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "builders.message.attrs([h.Id(messageId(model.id)), h.Role('status')]),",
        replace:
          "builders.message.attrs([h.Id(messageId(model.id)), ...(Option.isSome(said) ? [h.Role('status')] : [])]),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input does not point at the refusal',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '...(Option.isSome(said) ? [h.AriaDescribedBy(messageId(model.id))] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the shake does not travel',
    edits: [
      {
        file: '../src/recipes/tagsInput.ts',
        find: 'animation: `${name} ${travelled(ref.motion.moderate)} ${ref.motion.ease}`,',
        replace: 'animation: `${name} ${ref.motion.moderate} ${ref.motion.ease}`,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'both refusals shake under one name',
    edits: [
      {
        file: '../src/recipes/tagsInput.ts',
        find: '{ even: shake(shakes.even.name), odd: shake(shakes.odd.name) }',
        replace: '{ even: shake(shakes.even.name), odd: shake(shakes.even.name) }',
      },
    ],
    tests: [browser],
  },
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
        find: "draft: draft => (fresh.length === 0 ? draft : ''),",
        replace: "draft: () => '',",
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
