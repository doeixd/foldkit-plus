/**
 * The Button's icon, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/button.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/button.browser.test.ts']
const unit = ['packages/mixins-ui/test/buttonView.test.ts']
const recipe = '../src/recipes/button.ts'

export default [
  {
    name: 'the icon takes the icon variant’s zero font size',
    edits: [{ file: recipe, find: "        fontSize: ladder('icon'),\n", replace: '' }],
    tests: browser,
  },
  {
    name: 'the icon is not drawn',
    edits: [
      {
        file: '../src/button.ts',
        find: ': [h.span([...icon, h.AriaHidden(true)], [options.icon]), options.label],',
        replace: ': [options.label],',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the icon is read aloud',
    edits: [
      {
        file: '../src/button.ts',
        find: 'h.span([...icon, h.AriaHidden(true)], [options.icon])',
        replace: 'h.span(icon, [options.icon])',
      },
    ],
    tests: unit,
  },
  {
    name: 'a square button keeps its words',
    edits: [
      {
        file: recipe,
        find: 'square: { button: variant(Style.self(square)) },',
        replace: 'square: { button: variant(Style.self({})) },',
      },
    ],
    tests: browser,
  },
]
