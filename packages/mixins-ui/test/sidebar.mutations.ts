/**
 * The sidebar, broken in turn: `pnpm mutate packages/mixins-ui/test/sidebar.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/sidebar.test.ts']
const browser = ['packages/mixins-ui/test/sidebar.browser.test.ts']
const file = '../src/sidebar.ts'
const recipe = '../src/recipes/sidebar.ts'

export default [
  {
    name: 'the toggle says the opposite of what shows',
    edits: [
      {
        file,
        find: 'h.AriaExpanded(!model.collapsed),',
        replace: 'h.AriaExpanded(model.collapsed),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the toggle is always named Hide',
    edits: [
      {
        file,
        find: 'model.collapsed ? `Show ${options.label}` : `Hide ${options.label}`',
        replace: '`Hide ${options.label}`',
      },
    ],
    tests: unit,
  },
  {
    name: 'a collapsed navigation stays in reach',
    edits: [{ file, find: 'model.collapsed && !rail ?', replace: 'false ?' }],
    tests: unit,
  },
  {
    name: 'a collapsed rail is out of reach',
    edits: [{ file, find: 'model.collapsed && !rail ?', replace: 'model.collapsed ?' }],
    tests: unit,
  },
  {
    name: "a shut group's rows stay in reach",
    edits: [{ file, find: "...(shown ? [] : [h.Attribute('inert', '')]),", replace: '' }],
    tests: unit,
  },
  {
    name: 'every group heading reads as open',
    edits: [{ file, find: 'h.AriaExpanded(shown),', replace: 'h.AriaExpanded(true),' }],
    tests: unit,
  },
  {
    name: 'a group heading names the navigation, not its rows',
    edits: [{ file, find: 'h.AriaControls(linksId),', replace: 'h.AriaControls(navId),' }],
    tests: unit,
  },
  {
    name: 'every link marks the current page',
    edits: [{ file, find: 'leaf.current === true ?', replace: 'true ?' }],
    tests: unit,
  },
  {
    name: 'a press only ever opens a group',
    edits: [{ file, find: 'flipped(open, id)', replace: '[...open, id]' }],
    tests: unit,
  },
  {
    name: 'a rail branch opened twice is open twice',
    edits: [{ file, find: 'open.includes(id) ? open : [...open, id]', replace: '[...open, id]' }],
    tests: unit,
  },
  {
    name: 'a link followed in the Sheet leaves it open',
    edits: [
      {
        file,
        find: 'FollowedInSheet: () => sheetStep(model, Sheet.close(model.sheet)),',
        replace: 'FollowedInSheet: () => ({ model }),',
      },
    ],
    tests: unit,
  },
  {
    name: "the Sheet's links send nothing",
    edits: [{ file, find: 'followed: onMessage(Message.FollowedInSheet()),', replace: '' }],
    tests: browser,
  },
  {
    name: 'a branch opens nothing',
    edits: [{ file, find: 'h.OnClick(onMessage(press)),', replace: '' }],
    tests: browser,
  },
  {
    name: 'a branch pressed in a rail only toggles',
    edits: [
      {
        file,
        find: '? Message.ExpandedTo({ id: row.id })',
        replace: '? Message.ToggledSection({ id: row.id })',
      },
    ],
    tests: browser,
  },
  {
    name: 'the marker measures nothing',
    edits: [
      {
        file,
        find: "targets: { 'sidebar-chosen': current }",
        replace: "targets: { 'sidebar-chosen': '[data-never]' }",
      },
    ],
    tests: browser,
  },
  {
    name: "a rail's tooltips show on the right right to left",
    edits: [{ file, find: "options.direction === 'rtl' ? 'left' : 'right'", replace: "'right'" }],
    tests: browser,
  },
  {
    name: 'the current link keeps its fill under the marker',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`${unlit}[aria-current="page"]`, { background: ref.accent.subtle }),',
        replace: 'Style.pseudo(\'[aria-current="page"]\', { background: ref.accent.subtle }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a collapsed navigation keeps its width',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(collapsed, { inlineSize: '0', opacity: '0' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a rail is as wide as the column',
    edits: [
      {
        file: recipe,
        find: "        inlineSize: ladder('height'),\n        opacity: '1',",
        replace: "        opacity: '1',",
      },
    ],
    tests: browser,
  },
  {
    name: "a fill's navigation keeps its own width",
    edits: [
      { file: recipe, find: "Style.self({ inlineSize: 'auto' }),", replace: 'Style.self({}),' },
    ],
    tests: browser,
  },
  {
    name: "a rail's ends keep their content at the start",
    edits: [
      {
        file: recipe,
        find: "inlineSize: ladder('height'), justifyContent: 'center',",
        replace: "inlineSize: ladder('height'),",
      },
    ],
    tests: browser,
  },
  {
    name: "a rail shows an end's detail",
    edits: [
      {
        file: recipe,
        find: "Style.nest(railed, { display: 'none' }),\n    ),\n    // A row over",
        replace: '),\n    // A row over',
      },
    ],
    tests: browser,
  },
  {
    name: 'a phone shows no opener',
    edits: [
      { file: recipe, find: "onPhone('&', { display: 'block' })", replace: 'Style.self({})' },
    ],
    tests: browser,
  },
]
