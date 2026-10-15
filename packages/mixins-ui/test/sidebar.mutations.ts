/**
 * The sidebar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sidebar.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/sidebar.ts'
const unit = 'packages/mixins-ui/test/sidebar.test.ts'

export default [
  {
    name: 'the toggle says the opposite of what shows',
    edits: [
      {
        file,
        find: 'h.AriaExpanded(!options.collapsed),',
        replace: 'h.AriaExpanded(options.collapsed),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the toggle is always named Hide',
    edits: [
      {
        file,
        find: 'options.collapsed ? `Show ${options.label}` : `Hide ${options.label}`',
        replace: '`Hide ${options.label}`',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a collapsed navigation stays in reach',
    edits: [
      { file, find: "...(options.collapsed ? [h.Attribute('inert', '')] : []),", replace: '' },
    ],
    tests: [unit],
  },
  {
    name: "a shut section's links stay in reach",
    edits: [{ file, find: "...(shown ? [] : [h.Attribute('inert', '')]),", replace: '' }],
    tests: [unit],
  },
  {
    name: 'every section heading reads as open',
    edits: [{ file, find: 'h.AriaExpanded(shown),', replace: 'h.AriaExpanded(true),' }],
    tests: [unit],
  },
  {
    name: 'a section heading names the navigation, not its links',
    edits: [{ file, find: 'h.AriaControls(linksId),', replace: 'h.AriaControls(navId),' }],
    tests: [unit],
  },
  {
    name: 'every link marks the current page',
    edits: [{ file, find: 'link.current === true ?', replace: 'true ?' }],
    tests: [unit],
  },
  {
    name: 'a press only ever opens a section',
    edits: [{ file, find: 'flipped(open, id)', replace: '[...open, id]' }],
    tests: [unit],
  },
]
