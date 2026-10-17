/**
 * The message scroller, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/messageScroller.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/messageScroller.test.ts']
const browser = ['packages/mixins-ui/test/messageScroller.browser.test.ts']
const view = '../src/messageScroller.ts'
const recipe = '../src/recipes/messageScroller.ts'

export default [
  {
    name: 'growth is not followed',
    edits: [{ file: view, find: 'if (following) toEnd()', replace: 'if (false) toEnd()' }],
    tests: browser,
  },
  {
    name: 'a scroll up never leaves the end',
    edits: [
      { file: view, find: 'else if (scroller.scrollTop < lastTop) report(false)', replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'older messages above push the view down',
    edits: [{ file: view, find: 'if (Math.abs(moved) >= 0.5) {', replace: 'if (false) {' }],
    tests: browser,
  },
  {
    name: 'the browser anchors too',
    edits: [{ file: view, find: "scroller.style.overflowAnchor = 'none'", replace: '' }],
    tests: browser,
  },
  {
    name: 'the jump drops its focus',
    edits: [{ file: view, find: 'scroller.focus({ preventScroll: true })', replace: '' }],
    tests: browser,
  },
  {
    name: 'the jump does not scroll',
    edits: [
      {
        file: view,
        find: 'Jumped: () => ({ model, commands: [ScrollToEnd({ id: model.id })] }),',
        replace: 'Jumped: () => ({ model }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'arrivals at the end are counted',
    edits: [{ file: view, find: 'model.following || count <= 0', replace: 'count <= 0' }],
    tests: unit,
  },
  {
    name: 'the count outlives the return to the end',
    edits: [{ file: view, find: 'unseen: () => 0 })', replace: 'unseen: () => model.unseen })' }],
    tests: unit,
  },
  {
    name: 'the jump button shows at the end too',
    edits: [{ file: view, find: '...(model.following\n', replace: '...(false\n' }],
    tests: unit,
  },
  {
    name: 'the jump floats at the area’s top',
    edits: [
      {
        file: recipe,
        find: 'insetBlockEnd: ref.space.sm,',
        replace: 'insetBlockStart: ref.space.sm,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the jump hugs the start',
    edits: [{ file: recipe, find: "marginInline: 'auto',", replace: '' }],
    tests: browser,
  },
]
