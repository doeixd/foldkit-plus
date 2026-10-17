/**
 * The empty line's hint, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/hint.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/placeholder.test.ts']

export default [
  {
    name: 'a heading is hinted',
    edits: [
      {
        file,
        find: "return block?.type === 'Paragraph' && block.children.every",
        replace: "return block !== undefined && block.type !== 'Unknown' && block.children.every",
      },
    ],
    tests,
  },
  {
    name: 'a line under a range is hinted',
    edits: [
      {
        file,
        find: "Element | undefined => {\n  if (selection?.type !== 'Range' || !samePosition(selection.anchor, selection.focus)) {",
        replace: "Element | undefined => {\n  if (selection?.type !== 'Range') {",
      },
    ],
    tests,
  },
  {
    name: 'a line with text is hinted',
    edits: [{ file, find: ".every(each => each.text === '')", replace: '.every(() => true)' }],
    tests,
  },
  {
    name: 'a blank document is hinted too',
    edits: [{ file, find: '  if (RichText.isBlank(dom.content)) return undefined\n', replace: '' }],
    tests,
  },
  {
    name: 'the hint stays where the caret left',
    edits: [
      {
        file,
        find: "    if (hinted !== target) hinted?.removeAttribute('data-hint')\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a selection reported does not move the hint',
    edits: [
      {
        file,
        find: '    if (selection === null || sameSelection(selection, lastSelection)) return\n    lastSelection = selection\n    hint()\n',
        replace:
          '    if (selection === null || sameSelection(selection, lastSelection)) return\n    lastSelection = selection\n',
      },
    ],
    tests,
  },
  {
    name: 'a drawn edit hints from the selection before it',
    edits: [
      {
        file,
        find: '    lastSelection = state.selection\n    redraw(patchInto(current, state.document, changeSet, options.decorate?.(state.document)))\n',
        replace:
          '    redraw(patchInto(current, state.document, changeSet, options.decorate?.(state.document)))\n    lastSelection = state.selection\n',
      },
    ],
    tests,
  },
]
