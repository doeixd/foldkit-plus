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
    name: 'a new row has one cell',
    edits: [{ file, find: 'block: Blocks.row(width)', replace: 'block: Blocks.row(1)' }],
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
]
