/**
 * The accordion, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/accordion.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/accordion.test.ts']
const browser = ['packages/mixins-ui/test/accordion.browser.test.ts']
const view = '../src/accordion.ts'
const recipe = '../src/recipes/accordion.ts'

export default [
  {
    name: 'a single accordion keeps the others open',
    edits: [
      {
        file: view,
        find: '  if (!isOpen) return [id]',
        replace: '  if (!isOpen) return [...open, id]',
      },
    ],
    tests: unit,
  },
  {
    name: 'a single accordion cannot shut its last section',
    edits: [{ file: view, find: 'options.collapsible === false ? open : []', replace: 'open' }],
    tests: unit,
  },
  {
    name: 'a shut panel stays reachable',
    edits: [{ file: view, find: "...(shown ? [] : [h.Attribute('inert', '')]),", replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'an open panel stays shut',
    edits: [
      {
        file: recipe,
        find: "        gridTemplateRows: '1fr',",
        replace: "        gridTemplateRows: '0fr',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a shut panel keeps its padding',
    edits: [
      {
        file: recipe,
        find: "body: component(Style.self({ minBlockSize: '0', overflow: 'hidden' })),",
        replace: 'body: component(Style.self({})),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the chevron does not turn',
    edits: [
      {
        file: recipe,
        find: "Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the open title widens as it turns semibold',
    edits: [{ file: recipe, find: "      Utilities.steady('semibold'),\n", replace: '' }],
    tests: browser,
  },
]
