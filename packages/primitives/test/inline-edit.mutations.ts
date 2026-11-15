/**
 * InlineEdit, each part broken in turn: `pnpm mutate
 * packages/primitives/test/inline-edit.mutations.ts` checks a test fails for every one.
 */
const file = '../src/interaction/inline-edit.ts'
const unit = ['packages/primitives/test/inline-edit.test.ts']
const browser = ['packages/primitives/test/inline-edit.browser.test.ts']

export default [
  {
    name: 'a second start of the same item starts it over',
    edits: [
      {
        file,
        find: 'Option.isSome(editingOf(model, id)) ? { model } : start(args, id, text, text),',
        replace: 'start(args, id, text, text),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a key before the field is drawn always appends',
    edits: [
      {
        file,
        find: 'const untouched = editing.draft === editing.initial',
        replace: 'const untouched = false',
      },
    ],
    tests: unit,
  },
  {
    name: 'Backspace before the field is drawn clears the draft',
    edits: [{ file, find: ": Array.from(editing.draft).slice(0, -1).join('')", replace: ": ''" }],
    tests: unit,
  },
  {
    name: 'Enter before the field is drawn commits nothing',
    edits: [
      {
        file,
        find: "if (key === 'Enter') return commit(model, args, id, true)",
        replace: "if (key === 'Enter') return { model }",
      },
    ],
    tests: unit,
  },
  {
    name: 'an unchanged value is committed too',
    edits: [
      {
        file,
        find: '...(draft === initial ? {} : { outMessage: Committed.make({ id, value: draft, initial }) }),',
        replace: 'outMessage: Committed.make({ id, value: draft, initial }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'leaving the field always cancels',
    edits: [{ file, find: "args.blur === 'commit'", replace: 'false' }],
    tests: unit,
  },
  {
    name: 'Space starts an edit where the value shows',
    edits: [
      {
        file,
        find: "isPrintable(key, modifiers) && key !== ' '",
        replace: 'isPrintable(key, modifiers)',
      },
    ],
    tests: unit,
  },
  {
    name: 'the field always selects its text',
    edits: [
      {
        file,
        find: 'if (input.value === initial) input.select()',
        replace: 'if (true) input.select()',
      },
    ],
    tests: browser,
  },
  {
    name: 'focus comes back even when the user moved it elsewhere',
    edits: [
      {
        file,
        find: 'if (active === null || active === document.body || !active.isConnected)',
        replace: 'if (true)',
      },
    ],
    tests: browser,
  },
  {
    name: 'Escape hands no focus back',
    edits: [
      {
        file,
        find: `        model: { editing: Option.none() },
        ...(refocus ? { commands: [returnFocus(args, id)] } : {}),
      }`,
        replace: `        model: { editing: Option.none() },
      }`,
      },
    ],
    tests: browser,
  },
  {
    name: 'a refusal is not announced on the field',
    edits: [
      {
        file,
        find: '? [h.AriaInvalid(true), h.AriaDescribedBy(errorId(args))]',
        replace: '? []',
      },
    ],
    tests: browser,
  },
]
