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
  {
    name: 'the header is not drawn',
    edits: [
      {
        file: view,
        find: '...(options.header === undefined ? [] : [h.div(builders.header.attrs(), [options.header])]),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the footer comes before the actions',
    edits: [
      {
        file: view,
        find: '...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),',
        replace: '',
      },
      {
        file: view,
        find: '...(options.actions === undefined',
        replace:
          '...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]), ...(options.actions === undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a new-tab link ignores its words',
    edits: [
      {
        file: view,
        find: 'newTab: wordsOf(words, options.words).newTab,',
        replace: 'newTab: words.newTab,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a group does not wrap its rows',
    edits: [{ file: view, find: 'around(view({', replace: '(view({' }],
    tests: unit,
  },
  {
    name: 'a preset’s style does not reach a group’s rows',
    edits: [
      {
        file: view,
        find: '...(preset.style === undefined ? {} : { itemStyle: preset.style }),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the header lies under the overlay',
    edits: [
      {
        file: recipe,
        find: `header: component(
      Style.self({ position: 'relative', zIndex: '1', flex: '0 0 100%', minWidth: '0' }),`,
        replace: `header: component(
      Style.self({ flex: '0 0 100%', minWidth: '0' }),`,
      },
    ],
    tests: browser,
  },
  {
    name: 'a header is only as wide as its words',
    edits: [
      {
        file: recipe,
        find: `header: component(
      Style.self({ position: 'relative', zIndex: '1', flex: '0 0 100%', minWidth: '0' }),`,
        replace: `header: component(
      Style.self({ position: 'relative', zIndex: '1', minWidth: '0' }),`,
      },
    ],
    tests: browser,
  },
]
