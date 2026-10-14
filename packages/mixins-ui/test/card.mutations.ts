/**
 * Card and CardGroup, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/card.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = ['packages/mixins-ui/test/card.test.ts']
const browser = ['packages/mixins-ui/test/card.browser.test.ts']
const view = '../src/card.ts'
const recipe = '../src/recipes/card.ts'

export default [
  {
    name: 'the outlined card loses its surface',
    edits: [
      {
        file: recipe,
        find: '          Style.self({\n            background: ref.surface.base,\n            border:',
        replace:
          '          Style.self({\n            background: ref.surface.muted,\n            border:',
      },
    ],
    tests: unit,
  },
  {
    name: 'cards default to flush padding',
    edits: [
      {
        file: recipe,
        find: "defaults: { orientation: 'stacked', surface: 'outlined', padding: 'comfortable' },",
        replace: "defaults: { orientation: 'stacked', surface: 'outlined', padding: 'flush' },",
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
    name: 'the action sits under the overlay',
    edits: [
      {
        file: recipe,
        find: "        gridRow: '1 / span 2',\n        position: 'relative',\n        zIndex: '1',\n        display: 'flex',",
        replace: "        gridRow: '1 / span 2',\n        display: 'flex',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the dismiss button is always shown',
    edits: [
      {
        file: recipe,
        find: "      Style.nest('&[data-reveal=\"hover\"]', { opacity: '0' }),\n",
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the dismiss button is never revealed by touch',
    edits: [
      {
        file: recipe,
        find: "      Style.media('(hover: none)', { opacity: '1' }),\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled card still sends its Message',
    edits: [
      {
        file: view,
        find: '...(disabled ? [h.Disabled(true)] : [h.OnClick(press.onClick)]),',
        replace: '...[h.OnClick(press.onClick)],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled link still goes somewhere',
    edits: [
      {
        file: view,
        find: '...(disabled\n            ? [h.AriaDisabled(true)]\n            : [',
        replace: '...(false\n            ? [h.AriaDisabled(true)]\n            : [',
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
    name: 'a pressable card with no name is drawn nameless',
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
    name: 'an external link opens in this tab',
    edits: [
      {
        file: view,
        find: "...(external ? [h.Target('_blank'), h.Rel('noopener noreferrer')] : []),",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a chosen button is not pressed',
    edits: [{ file: view, find: '[h.AriaPressed(flag(options.selected))]', replace: '[]' }],
    tests: unit,
  },
  {
    name: 'a group places cards by column for row',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('row', String(Math.floor(index / columns))),",
        replace: "h.DataAttribute('row', String(index % columns)),",
      },
    ],
    tests: unit,
  },
  {
    name: 'a grid reads nearness down only',
    edits: [{ file: view, find: "axis: columns > 1 ? 'xy' : 'y',", replace: "axis: 'y'," }],
    tests: unit,
  },
  {
    name: "a group's card style is ignored",
    edits: [
      { file: view, find: 'style: card.style ?? options.cardStyle', replace: 'style: card.style' },
    ],
    tests: unit,
  },
  {
    name: 'the highlight is not drawn',
    edits: [
      {
        file: view,
        find: '      ...(fluid ? [h.div(builders.highlight.attrs([h.AriaHidden(true)]), [])] : []),\n',
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'columns are not checked',
    edits: [
      {
        file: view,
        find: '  if (!Number.isInteger(columns) || columns < 1) {',
        replace: '  if (false) {',
      },
    ],
    tests: unit,
  },
]
