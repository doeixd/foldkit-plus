/**
 * The button group, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/buttonGroup.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/buttonGroup.test.ts']
const browser = ['packages/mixins-ui/test/buttonGroup.browser.test.ts']
const tests = [...unit, ...browser]
const view = '../src/buttonGroup.ts'
const recipe = '../src/recipes/buttonGroup.ts'

export default [
  {
    name: 'the group goes unnamed',
    edits: [
      {
        file: view,
        find: "builders.root.attrs([h.Role('group'), h.AriaLabel(options.label), orientation]),",
        replace: "builders.root.attrs([h.Role('group'), orientation]),",
      },
    ],
    tests,
  },
  {
    name: 'words are drawn in the wrong box',
    edits: [
      {
        file: view,
        find: "typeof item === 'string' ? h.span(builders.text.attrs(), [item]) : item,",
        replace: "typeof item === 'string' ? h.span(builders.separator.attrs(), [item]) : item,",
      },
    ],
    tests,
  },
  {
    name: 'a separated group draws no rules',
    edits: [{ file: view, find: 'options.separated === true', replace: 'false' }],
    tests,
  },
  {
    name: 'a rule is read aloud',
    edits: [
      {
        file: view,
        find: 'builders.separator.attrs([h.AriaHidden(true), orientation])',
        replace: 'builders.separator.attrs([orientation])',
      },
    ],
    tests,
  },
  {
    name: 'a rule does not say its orientation',
    edits: [
      {
        file: view,
        find: 'builders.separator.attrs([h.AriaHidden(true), orientation])',
        replace: 'builders.separator.attrs([h.AriaHidden(true)])',
      },
    ],
    tests,
  },
  {
    name: 'borders double up between buttons',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`${across} > * + *`, { marginInlineStart: overlap }),',
        replace: "Style.nest(`${across} > * + *`, { marginInlineStart: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'a column overlaps nothing',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`${down} > * + *`, { marginBlockStart: overlap }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a column squares the corners a row would',
    edits: [
      {
        file: recipe,
        find: "Style.nest(face(down, first), { borderEndStartRadius: '0', borderEndEndRadius: '0' }),",
        replace:
          "Style.nest(face(down, first), { borderStartEndRadius: '0', borderEndEndRadius: '0' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'joining sides keep their radius',
    edits: [
      {
        file: recipe,
        find: "Style.nest(face(across, first), { borderStartEndRadius: '0', borderEndEndRadius: '0' }),",
        replace:
          "Style.nest(face(across, first), { borderStartEndRadius: '4px', borderEndEndRadius: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'a wrapper keeps the corners from its face',
    edits: [
      {
        file: recipe,
        find: '`${row} > ${child}, ${row} > ${child} > :first-child`',
        replace: '`${row} > ${child}`',
      },
    ],
    tests: browser,
  },
  {
    name: 'a rule lies under the button after it',
    edits: [{ file: recipe, find: "zIndex: '2',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a focused item stays under its neighbour',
    edits: [
      {
        file: recipe,
        find: "Style.nest('& > :focus-within', { position: 'relative', zIndex: '3' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a row across its container stays its own width',
    edits: [
      {
        file: recipe,
        find: "fill: { root: variant(Style.self({ display: 'flex' })) },",
        replace: '',
      },
    ],
    tests: browser,
  },
]
