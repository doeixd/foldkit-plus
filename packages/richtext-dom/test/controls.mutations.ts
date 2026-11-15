/**
 * The editor beside its controls, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/controls.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/controls.browser.test.ts']

export default [
  {
    name: 'a press on a marked control takes the focus from the text',
    edits: [
      {
        file,
        find: 'if (ownsSelection()) event.preventDefault()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a press on a marked control is held back whoever has the focus',
    edits: [
      {
        file,
        find: 'if (ownsSelection()) event.preventDefault()',
        replace: 'event.preventDefault()',
      },
    ],
    tests,
  },
  {
    name: 'a press on any control is held back, marked or not',
    edits: [
      {
        file,
        find: '|| origin.closest(`[${CONTROLS_ATTRIBUTE}]`) === null) return',
        replace: ') return',
      },
    ],
    tests,
  },
  {
    name: 'a press on a field among the controls is held back',
    edits: [{ file, find: 'if (origin.closest(TYPED_IN) !== null) return', replace: '' }],
    tests,
  },
  {
    name: 'the browser’s selection is reported while a control has the focus',
    edits: [{ file, find: 'if (ownsSelection()) reportLive()', replace: 'reportLive()' }],
    tests,
  },
  {
    name: 'a selection made just before the focus leaves is never reported',
    edits: [
      {
        file,
        find: 'if (focusElsewhere() && left instanceof Node && current.root.contains(left)) reportLive()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the browser’s selection is reported whenever the focus moves between controls',
    edits: [
      {
        file,
        find: 'if (focusElsewhere() && left instanceof Node && current.root.contains(left)) reportLive()',
        replace: 'if (focusElsewhere()) reportLive()',
      },
    ],
    tests,
  },
  {
    name: 'nothing stands in for the selection while the focus is elsewhere',
    edits: [
      {
        file,
        find: 'standIn = focusElsewhere() ? standInFor(selection) : undefined',
        replace: 'standIn = undefined',
      },
    ],
    tests,
  },
  {
    name: 'the stand-in stays when the focus is back in the text',
    edits: [
      {
        file,
        find: 'standIn = focusElsewhere() ? standInFor(selection) : undefined',
        replace: 'standIn = standInFor(selection)',
      },
    ],
    tests,
  },
  {
    name: 'the stand-in is not drawn until something else redraws',
    edits: [
      {
        file,
        find: 'if (!sameStandIn(drawn, standIn)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a command’s redraw drops the stand-in',
    edits: [
      {
        file,
        find: 'redraw(patchInto(current, state.document, changeSet, decorationsOver(state.document)))',
        replace:
          'redraw(patchInto(current, state.document, changeSet, options.decorate?.(state.document)))',
      },
    ],
    tests,
  },
  {
    name: 'the stand-in is not moved to the selection a command leaves',
    edits: [{ file, find: '    standInWhileElsewhere(state.selection)', replace: '' }],
    tests,
  },
  {
    name: 'a decoration refresh drops the stand-in',
    edits: [
      {
        file,
        find: 'redraw(patchInto(current, current.content, unchanged, decorationsOver(current.content)))\n      if (selection !== null && owned)',
        replace:
          'redraw(patchInto(current, current.content, unchanged, options.decorate?.(current.content)))\n      if (selection !== null && owned)',
      },
    ],
    tests,
  },
  {
    name: 'a selection made backwards in one run is not drawn',
    edits: [
      {
        file,
        find: 'const backwards = anchor.node === focus.node && anchor.offset > focus.offset',
        replace: 'const backwards = false',
      },
    ],
    tests,
  },
  {
    name: 'a caret is given a stand-in',
    edits: [
      {
        file,
        find: "if (selection?.type !== 'Range' || samePosition(selection.anchor, selection.focus)) {\n    return undefined\n  }\n  const { anchor, focus } = selection",
        replace:
          "if (selection?.type !== 'Range') {\n    return undefined\n  }\n  const { anchor, focus } = selection",
      },
    ],
    tests,
  },
  {
    name: 'the selection is not put back when a key returns the focus',
    edits: [
      {
        file,
        find: 'if (current.root.ownerDocument.activeElement === current.root) {\n      restoreSelection(current, lastSelection)\n    }',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the selection is put back over the caret a press placed',
    edits: [
      {
        file,
        find: 'if (pressing || lastSelection === null) return',
        replace: 'if (lastSelection === null) return',
      },
    ],
    tests,
  },
  {
    name: 'the selection is put back though the focus went to a control inside the text',
    edits: [
      {
        file,
        find: 'if (current.root.ownerDocument.activeElement === current.root) {\n      restoreSelection(current, lastSelection)',
        replace: '{\n      restoreSelection(current, lastSelection)',
      },
    ],
    tests,
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
