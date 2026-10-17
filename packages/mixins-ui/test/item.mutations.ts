/**
 * The item, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/item.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = ['packages/mixins-ui/test/item.test.ts']
const browser = ['packages/mixins-ui/test/item.browser.test.ts']
const view = '../src/item.ts'
const recipe = '../src/recipes/item.ts'

export default [
  {
    name: 'titles read regular weight',
    edits: [
      {
        file: recipe,
        find: 'fontWeight: ref.weight.semibold,',
        replace: 'fontWeight: ref.weight.normal,',
      },
    ],
    tests: unit,
  },
  {
    name: 'every row is compact',
    edits: [
      {
        file: recipe,
        find: "defaults: { variant: 'plain', density: 'comfortable', media: 'plain' },",
        replace: "defaults: { variant: 'plain', density: 'compact', media: 'plain' },",
      },
    ],
    tests: unit,
  },
  {
    name: 'a row with no content draws a stand-in',
    edits: [
      {
        file: view,
        find: '...(options.content === undefined ? [] : [options.content]),',
        replace: "options.content ?? h.span([], ['nothing']),",
      },
    ],
    tests: unit,
  },
  {
    name: 'the label is ignored',
    edits: [
      {
        file: view,
        find: 'const name = options.label ?? options.title',
        replace: 'const name = options.title ?? options.label',
      },
    ],
    tests: unit,
  },
  {
    name: 'a pressable row with no name is drawn without its control',
    edits: [
      {
        file: view,
        find: '  if (press !== undefined && name === undefined) {\n',
        replace: '  if (false) {\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'a row says it is not pressable',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('pressable', flag(press !== undefined)),",
        replace: "h.DataAttribute('pressable', 'false'),",
      },
    ],
    tests: unit,
  },
  {
    name: 'the overlay covers only its own box',
    edits: [
      {
        file: recipe,
        find: "        position: 'absolute',\n        inset: '0',\n        margin: '0',",
        replace: "        margin: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the actions sit under the overlay',
    edits: [
      {
        file: recipe,
        find: "        position: 'relative',\n        zIndex: '1',\n        flex: 'none',",
        replace: "        flex: 'none',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a chosen row is a surface step, sunken on a dark page',
    edits: [
      {
        file: recipe,
        find: "        backgroundImage: `linear-gradient(${film('1')}, ${film('1')})`,",
        replace:
          '        backgroundImage: `linear-gradient(${ref.surface.muted}, ${ref.surface.muted})`,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a list draws a line above its first row',
    edits: [
      {
        file: recipe,
        find: "divided: { row: variant(Style.nest('& + &', { borderBlockStart: line })) },",
        replace: 'divided: { row: variant(Style.self({ borderBlockStart: line })) },',
      },
    ],
    tests: browser,
  },
  {
    name: 'an icon has no tile',
    edits: [{ file: recipe, find: '            background: ref.accent.subtle,\n', replace: '' }],
    tests: browser,
  },
]
