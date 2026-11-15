/**
 * The navigation menu's panels, keys and indicator, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/navMenu.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/navMenu.browser.test.ts']
const unit = ['packages/mixins-ui/test/nav.test.ts']
const view = '../src/nav.ts'
const recipe = '../src/recipes/nav.ts'

export default [
  {
    name: 'an unchanged open panel writes a new Model',
    edits: [
      {
        file: view,
        find: 'sameOpen(open, model.open) ? model : modifyFields',
        replace: 'false ? model : modifyFields',
      },
    ],
    tests: ['packages/mixins-ui/test/nav.test.ts'],
  },
  {
    // Both, or the panel is a popover never shown and every test fails for that.
    name: 'the panel stays in the page, under its box',
    edits: [
      { file: view, find: "        h.Attribute('popover', 'manual'),\n", replace: '' },
      {
        file: view,
        find: '          topLayer(\n',
        replace: '          ((action: never) => action)(\n',
      },
    ],
    tests,
  },
  {
    name: 'a second press leaves the panel shown',
    edits: [
      {
        file: view,
        find: 'Option.contains(model.open, panel) ? Option.none() : Option.some(panel),',
        replace: 'Option.some(panel),',
      },
    ],
    tests,
  },
  {
    name: 'ArrowDown opens the panel and focuses nothing',
    edits: [
      {
        file: view,
        find: 'commands: [Focus({ id: panelLinkId(model.id, index, 0) })],',
        replace: 'commands: [],',
      },
    ],
    tests,
  },
  {
    name: 'the arrows in a panel stay on their link',
    edits: [
      {
        file: view,
        find: 'commands: [Focus({ id: panelLinkId(model.id, entry, to) })]',
        replace: 'commands: [Focus({ id: panelLinkId(model.id, entry, from) })]',
      },
    ],
    tests,
  },
  {
    name: 'Escape leaves focus in the hidden panel',
    edits: [
      {
        file: view,
        find: '            commands: [Focus({ id: entryId(model.id, index) })],',
        replace: '            commands: [],',
      },
    ],
    tests,
  },
  {
    name: 'the row’s arrows read left to right in any direction',
    edits: [
      {
        file: view,
        find: 'const reading = readingKey(key, options.direction)',
        replace: 'const reading = key',
      },
    ],
    tests,
  },
  {
    name: 'a press outside counts as inside',
    edits: [
      { file: view, find: '!menu.contains(event.target)', replace: 'menu.contains(event.target)' },
    ],
    tests,
  },
  {
    name: 'focus leaving the menu leaves the panel shown',
    edits: [
      { file: view, find: '      h.OnFocusLeave(onMessage(Message.Dismissed())),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a column’s panels open below it',
    edits: [
      {
        file: view,
        find: "const placement = vertical ? beside : 'bottom-start'",
        replace: "const placement = 'bottom-start'",
      },
    ],
    tests,
  },
  {
    name: 'a column’s panels open on the right right to left',
    edits: [
      {
        file: view,
        find: "options.direction === 'rtl' ? 'left-start' : 'right-start'",
        replace: "'right-start'",
      },
    ],
    tests,
  },
  {
    name: 'a trigger whose panel holds the current page is not marked',
    edits: [
      {
        file: view,
        find: "...(holdsCurrent ? [h.DataAttribute('current', '')] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the hover chases a panel’s links',
    edits: [
      {
        file: view,
        find: 'item: `:is(a, button)${outsidePanels}`,',
        replace: "item: ':is(a, button)',",
      },
    ],
    tests,
  },
  {
    name: 'a squeezed row shrinks the chevron to its borders',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      flex: 'none',\n      inlineSize: size,\n      blockSize: size,\n      marginBlockStart: '-0.2em',",
        replace:
          "      inlineSize: size,\n      blockSize: size,\n      marginBlockStart: '-0.2em',",
      },
    ],
    tests,
  },
  {
    name: "a panel's groups are a fixed row of 12rem columns, as before",
    edits: [
      {
        file: recipe,
        find: "display: 'flex', flexWrap: 'wrap',",
        replace: "display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(12rem, 1fr)',",
      },
    ],
    tests,
  },
  {
    name: 'the pill is a line',
    edits: [
      {
        file: recipe,
        find: "            inlineSize: at('chosen', 'w'),\n            blockSize: at('chosen', 'h'),\n            marginBlockStart: '0',",
        replace: "            inlineSize: at('chosen', 'w'),\n            marginBlockStart: '0',",
      },
    ],
    tests,
  },
  {
    name: "the application's routes on the row are dropped",
    edits: [{ file: view, find: '...(options.routes ?? []),', replace: '' }],
    tests: [...tests, ...unit],
  },
  {
    name: "the application's routes in a panel are dropped",
    edits: [{ file: view, find: '...(options.panelRoutes ?? []),', replace: '' }],
    tests,
  },
  {
    name: 'a link takes no key',
    edits: [{ file: view, find: 'linkKeys({ input: entry, h, item: { index } }),', replace: '' }],
    tests: [...tests, ...unit],
  },
  {
    name: 'a trigger takes no key',
    edits: [
      { file: view, find: 'triggerKeys({ input: entry, h, item: { index } }),', replace: '' },
    ],
    tests: [...tests, ...unit],
  },
  {
    name: "a panel's own keys move nothing",
    edits: [
      {
        file: view,
        find: '...PANEL_KEYS.map(key =>',
        replace: '...([] as unknown as typeof PANEL_KEYS).map(key =>',
      },
    ],
    tests,
  },
  {
    name: 'Escape in an open panel does nothing',
    edits: [
      {
        file: view,
        find: 'builders.item.attrs(shown ? [escapeKeys({ input: entry, h, item: { index } })] : [])',
        replace: 'builders.item.attrs()',
      },
    ],
    tests,
  },
  {
    name: 'Shift stops a row key',
    edits: [
      {
        file: view,
        find: 'Behaviors.Keys.route<NavEntry, Message>(`Nav ${key}`, {\n        on: [...Behaviors.Keys.withShift(key)],',
        replace:
          'Behaviors.Keys.route<NavEntry, Message>(`Nav ${key}`, {\n        on: [Behaviors.Keys.chord(key)],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a panel key moves among the panel of the first entry',
    edits: [
      {
        file: view,
        find: 'Option.fromNullishOr(id === undefined ? undefined : panelAt.get(id))',
        replace: 'Option.some(0)',
      },
    ],
    tests,
  },
]
