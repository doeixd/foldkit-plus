/**
 * The playground's transitions, each step broken in turn: `pnpm mutate
 * examples/richtext-playground/test/app.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/app.ts'
const tests = ['examples/richtext-playground/test/app.test.ts']

export default [
  {
    name: 'an insert goes after a blank line instead of before it',
    edits: [
      {
        file,
        find: 'return blank ? { before: top.id } : { after: top.id }',
        replace: 'return { after: top.id }',
      },
    ],
    tests,
  },
  {
    name: 'an insert goes beside the caret’s own block, inside a cell',
    edits: [
      {
        file,
        find: 'const top = run === undefined ? undefined : children[run.path[0]!]',
        replace:
          'const top = run === undefined ? undefined : RichText.blockAtPath(model.document, run.path)',
      },
    ],
    tests,
  },
  {
    name: 'a comment is posted with nothing said',
    edits: [
      {
        file,
        find: "if (body === '' || !RichText.coversText",
        replace: 'if (!RichText.coversText',
      },
    ],
    tests,
  },
  {
    name: 'resolving leaves the highlight',
    edits: [
      {
        file,
        find: "EditorMessage.ClearedMark({ mark: { name: 'Comment', props: { thread } } }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'resolving clears every discussion in its text',
    edits: [
      {
        file,
        find: "EditorMessage.ClearedMark({ mark: { name: 'Comment', props: { thread } } })",
        replace: "EditorMessage.ClearedMark({ mark: 'Comment' })",
      },
    ],
    tests,
  },
  {
    name: 'Enter in a closed toggle leaves it closed',
    edits: [
      {
        file,
        find: "const toggle = message._tag === 'Entered' ? closedToggleTitled(model) : undefined",
        replace: 'const toggle = undefined as RichText.NodeId | undefined',
      },
    ],
    tests,
  },
  {
    name: 'a duplicate lands before its block',
    edits: [
      {
        file,
        find: 'EditorMessage.InsertedBlock({ block, to: { after: node } })',
        replace: 'EditorMessage.InsertedBlock({ block, to: { before: node } })',
      },
    ],
    tests,
  },
  {
    name: 'a caption is saved untrimmed',
    edits: [
      {
        file,
        find: 'props: { caption: model.captionDraft.trim() }',
        replace: 'props: { caption: model.captionDraft }',
      },
    ],
    tests,
  },
  {
    name: 'an edit that changed nothing replaces the Model',
    edits: [
      {
        file,
        find: 'model: sameEditor(model.editor, editor) ? model : modifyFields',
        replace: 'model: false ? model : modifyFields',
      },
    ],
    tests,
  },
  {
    name: 'a heading jumped to keeps the old caret',
    edits: [
      {
        file,
        find: 'const placed = edit(closed(model), EditorMessage.Selected({ selection: caret }))',
        replace: 'const placed = { model: closed(model) }',
      },
    ],
    tests,
  },
  {
    name: 'a note’s arrow does nothing',
    edits: [
      {
        file,
        find: "if (message._tag === 'ActivatedAdornment' && message.action === RETURN_TO_REFERENCE) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a note’s arrow lands before the reference',
    edits: [
      {
        file,
        find: "const after = { node: run.run.id, offset: run.run.text.length, affinity: 'after' as const }",
        replace: "const after = { node: run.run.id, offset: 0, affinity: 'after' as const }",
      },
    ],
    tests,
  },
  {
    name: 'find opens empty over a selection',
    edits: [
      {
        file,
        find: "query: selected === '' ? open.query : selected",
        replace: 'query: open.query',
      },
    ],
    tests,
  },
  {
    name: 'the current match outlives the matches',
    edits: [{ file, find: 'return find.current > last', replace: 'return false' }],
    tests,
  },
  {
    name: 'an edit leaves the matches where they were',
    edits: [
      {
        file,
        find: 'model.find !== before.find || model.document !== before.document',
        replace: 'model.find !== before.find',
      },
    ],
    tests,
  },
  {
    name: 'closing the bar leaves its matches drawn',
    edits: [
      {
        file,
        find: 'Option.isSome(model.find) || Option.isSome(before.find)',
        replace: 'Option.isSome(model.find)',
      },
    ],
    tests,
  },
  {
    name: 'a match is made current without being selected',
    edits: [
      {
        file,
        find: 'const match = matchesOf(model, find)[index]',
        replace: 'const match = undefined',
      },
    ],
    tests,
  },
  {
    name: 'Markdown says nothing of what it left out',
    edits: [{ file, find: 'lost === 0', replace: 'true' }],
    tests,
  },
  {
    name: 'exporting leaves the menu open',
    edits: [
      {
        file,
        find: 'const { text, what } = exported(model.document, format)',
        replace:
          'const { text, what } = exported(model.document, format); const closed = (kept: Model) => kept',
      },
    ],
    tests,
  },
  {
    name: 'the status says the code whatever was copied',
    edits: [
      {
        file,
        find: 'Copied: () => ({ text: `Copied ${what}.`, failed: false }),',
        replace: "Copied: () => ({ text: 'Copied the code.', failed: false }),",
      },
    ],
    tests,
  },
  {
    name: 'an old status’s time takes a newer one away',
    edits: [
      { file, find: 'Option.getOrUndefined(model.status)?.text === status', replace: 'true' },
    ],
    tests,
  },
]
