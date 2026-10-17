/**
 * Tab, adornment actions and the toolbar's place above a block, each broken in turn: `pnpm mutate
 * packages/richtext-dom/test/tab.mutations.ts` checks that a test fails for every one.
 */
const events = '../src/events.ts'
const tests = [
  'packages/richtext-dom/test/tab.test.ts',
  'packages/richtext-dom/test/editor-bundle.test.ts',
]

export default [
  {
    name: 'Tab is taken everywhere',
    edits: [
      {
        file: events,
        find: '        if (!RichText.takesTab(current.content, readSelection(current), options.nodes)) return\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Shift+Tab indents',
    edits: [
      {
        file: events,
        find: "onIntent({ type: key.shiftKey ? 'Outdent' : 'Indent' })",
        replace: "onIntent({ type: 'Indent' })",
      },
    ],
    tests,
  },
  {
    name: 'an action is not reported',
    edits: [
      {
        file: events,
        find: '      options.onAction?.(',
        replace: '      ((_node: unknown, _action: unknown) => undefined)(',
      },
    ],
    tests,
  },
  {
    name: 'a toolbar above has no room and covers the block',
    edits: [
      {
        file: '../src/floating.ts',
        find: '    top: above >= 0 ? above : Math.max(0, target.top + gap),',
        replace: '    top: Math.max(0, above),',
      },
    ],
    tests,
  },
  {
    name: 'Tab in a table moves nowhere',
    edits: [
      {
        file: '../src/editor-bundle.ts',
        find: "    case 'Indented':\n      return { type: 'Indent' }",
        replace: "    case 'Indented':\n      return { type: 'Outdent' }",
      },
    ],
    tests,
  },
]
