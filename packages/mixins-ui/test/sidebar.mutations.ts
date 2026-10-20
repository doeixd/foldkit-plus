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
    name: 'a drag never collapses the column',
    edits: [{ file, find: 'return wanted < min / 2', replace: 'return false' }],
    tests: unit,
  },
  {
    name: 'a collapse by drag keeps the width it was dragged to',
    edits: [
      {
        file,
        find: '? resized(model, true, size)',
        replace: '? resized(model, true, clamp(wanted, min, max))',
      },
    ],
    tests: unit,
  },
  {
    name: 'a drag starts from the expanded width, not the one shown',
    edits: [{ file, find: 'const wanted = from + delta', replace: 'const wanted = size + delta' }],
    tests: unit,
  },
  {
    name: 'the keys ignore the bounds',
    edits: [
      {
        file,
        find: 'onSome: ({ min, max }) => resized(model, false, clamp(size, min, max)),',
        replace: 'onSome: () => resized(model, false, size),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a collapsed handle reads its expanded width',
    edits: [
      {
        file,
        find: 'h.AriaValuenow(model.collapsed ? 0 : size),',
        replace: 'h.AriaValuenow(size),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a drag reads left to right under rtl',
    edits: [
      { file, find: "across = element.matches(':dir(rtl)') ? -1 : 1", replace: 'across = 1' },
    ],
    tests: browser,
  },
  {
    name: 'the column ignores its width',
    edits: [
      {
        file: recipe,
        find: "inlineSize: 'var(--_fk-sidebar-width, 15rem)',",
        replace: "inlineSize: '15rem',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the handle sits inside the column',
    edits: [
      {
        file: recipe,
        find: "insetInlineEnd: `calc(-1 * (${ref.space['2xs']} + ${ref.border.thin} / 2))`,",
        replace: "insetInlineEnd: '0',",
      },
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
    name: "a group's action shows without a heading",
    edits: [{ file, find: '() => group.title !== undefined', replace: '() => true' }],
    tests: unit,
  },
  {
    name: "a link's item does not say it holds an action",
    edits: [
      { file, find: "h.DataAttribute('action', 'row')", replace: "h.DataAttribute('action', '')" },
    ],
    tests: browser,
  },
  {
    name: "a link's action is never drawn",
    edits: [{ file, find: '              actionOf(action),\n', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: "a link's action shows without the pointer",
    edits: [
      {
        file: recipe,
        find: "Style.nest(`:where(${actionRow}:not(:hover, :focus-within)) > &`, { opacity: '0' }),",
        replace: 'Style.self({}),',
      },
    ],
    tests: browser,
  },
  {
    name: "a badge stays under its row's action",
    edits: [
      {
        file: recipe,
        find: "Style.nest(`${lifted} &`, { opacity: '0' })",
        replace: 'Style.self({})',
      },
    ],
    tests: browser,
  },
  {
    name: 'an action stands at the top of its row',
    edits: [
      {
        file: recipe,
        find: 'insetBlockStart: `calc(${ref.space.xs} / 2)`,',
        replace: "insetBlockStart: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: "a heading's chevron runs under its action",
    edits: [
      {
        file: recipe,
        find: "      Style.nest(railed, { display: 'none' }),\n      Style.nest(headed, { paddingInlineEnd: controlHeight }),\n      focusRing,",
        replace: "      Style.nest(railed, { display: 'none' }),\n      focusRing,",
      },
    ],
    tests: browser,
  },
  {
    name: 'a floating column keeps its card on a phone',
    edits: [
      {
        file: recipe,
        find: "          // The variant's own, since it sets what the base's phone rule takes away.\n          onPhone('&[data-opens-sheet]', bareOpener),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a column keeps its surface on a phone',
    edits: [
      {
        file: recipe,
        find: "      Style.pseudo('[data-resizing]', { cursor: 'col-resize', userSelect: 'none' }),\n      onPhone('&[data-opens-sheet]', bareOpener),",
        replace:
          "      Style.pseudo('[data-resizing]', { cursor: 'col-resize', userSelect: 'none' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a floating column draws no edge',
    edits: [{ file: recipe, find: '            boxShadow: ref.shadow.sm,\n', replace: '' }],
    tests: browser,
  },
  {
    name: 'an inset column keeps its edge',
    edits: [
      {
        file: recipe,
        find: "            background: 'transparent',\n            borderInlineEnd: '0',\n",
        replace: "            background: 'transparent',\n",
      },
    ],
    tests: browser,
  },
  {
    name: "the column's edge takes its width from the content's side",
    edits: [
      {
        file: recipe,
        find: "paddingInlineEnd: `calc(${ref.space['2xs']} - ${ref.border.thin})`,",
        replace: "paddingInlineEnd: ref.space['2xs'],",
      },
    ],
    tests: browser,
  },
  {
    name: 'a floating column keeps the edge-side padding short',
    edits: [
      {
        file: recipe,
        find: "            // An edge all round: the padding is even again.\n            paddingInlineEnd: ref.space['2xs'],\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an icon narrower than its slot sits at its start',
    edits: [
      {
        file: recipe,
        find: "        flexShrink: '0',\n        alignItems: 'center',\n        justifyContent: 'center',\n        inlineSize: ladder('icon'),",
        replace: "        flexShrink: '0',\n        inlineSize: ladder('icon'),",
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
