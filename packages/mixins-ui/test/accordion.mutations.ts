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
        file: '../src/recipes/design.ts',
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
  {
    name: 'a separator after every section, the last too',
    edits: [
      {
        file: recipe,
        find: "Style.nest('& + &', { borderBlockStart:",
        replace: "Style.nest('&', { borderBlockStart:",
      },
    ],
    tests: browser,
  },
  {
    name: 'separated cards keep the line between them',
    edits: [
      {
        file: recipe,
        find: "...apart({ gap: ref.space.sm, '--_fk-accordion-separator': 'transparent' }),",
        replace: '...apart({ gap: ref.space.sm }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a section with an edge keeps its words against it',
    edits: [
      {
        file: recipe,
        find: '        paddingInline: inset,\n        border:',
        replace: "        paddingInline: '0',\n        border:",
      },
    ],
    tests: browser,
  },
  {
    name: 'filled sections are not filled',
    edits: [{ file: recipe, find: '            background: ref.surface.muted,', replace: '' }],
    tests: browser,
  },
  {
    name: 'a ghost row does not fill under the pointer',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(':is(:hover, :active):not(:disabled)', { background: unfilledHover }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the plus stays a plus open',
    edits: [
      {
        file: recipe,
        find: "Style.nest(`:where(${open}) > &::after`, { rotate: '0deg' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the plus box turns with the chevron',
    edits: [
      {
        file: recipe,
        find: "lower layer; the bars do the turning.\n            rotate: '0deg',",
        replace: 'lower layer; the bars do the turning.',
      },
    ],
    tests: browser,
  },
  {
    name: 'the indicator stays at the end',
    edits: [
      {
        file: recipe,
        find: "Style.self({ flexDirection: 'row-reverse', justifyContent: 'flex-end' })",
        replace: 'Style.self({})',
      },
    ],
    tests: browser,
  },
  {
    name: 'an open section is not tinted',
    edits: [
      {
        file: recipe,
        find: 'item: variant(Style.pseudo(open, { background: ref.accent.subtle })),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the view draws the chevron beside its own icon',
    edits: [
      {
        file: view,
        find: 'options.icon === undefined',
        replace: 'true',
      },
    ],
    tests: unit,
  },
]
