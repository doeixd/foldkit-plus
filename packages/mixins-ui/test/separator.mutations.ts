/**
 * The separator, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/separator.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/separator.test.ts']
const browser = ['packages/mixins-ui/test/separator.browser.test.ts']
const view = '../src/separator.ts'
const recipe = '../src/recipes/separator.ts'

export default [
  {
    name: 'every rule stands vertical',
    edits: [
      {
        file: view,
        find: 'h.AriaOrientation(orientation)',
        replace: "h.AriaOrientation('vertical')",
      },
    ],
    tests: unit,
  },
  {
    name: 'a decorative rule is still a separator',
    edits: [
      { file: view, find: "? [h.Role('none'), drawn]", replace: "? [h.Role('separator'), drawn]" },
    ],
    tests: unit,
  },
  {
    name: 'a labelled separator is one separator, hiding its words',
    edits: [
      {
        file: view,
        find: 'h.div(builders.rule.attrs([h.AriaHidden(true), drawn]), [])',
        replace: "h.div(builders.rule.attrs([h.Role('separator'), drawn]), [])",
      },
    ],
    tests: unit,
  },
  {
    name: 'vertical rules run along the row',
    edits: [
      {
        file: recipe,
        find: 'borderInlineStart: `${width} ${style} ${color}`,',
        replace: 'borderBlockStart: `${width} ${style} ${color}`,',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the line is the subtle outline',
    edits: [
      {
        file: recipe,
        find: 'const color = ref.outline.default',
        replace: 'const color = ref.outline.subtle',
      },
    ],
    tests: browser,
  },
  {
    name: 'dashed draws solid',
    edits: [
      {
        file: recipe,
        find: "dashed: set('--_fk-separator-style', 'dashed'),",
        replace: 'dashed: {},',
      },
    ],
    tests: browser,
  },
  {
    name: 'the frame’s choice stops at the frame',
    edits: [
      {
        file: recipe,
        find: "const style = 'var(--_fk-separator-style, solid)'",
        replace: "const style = 'solid'",
      },
    ],
    tests: browser,
  },
  {
    name: 'a rule in a labelled frame takes the spacing again',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&[data-orientation][aria-hidden=\"true\"]', { margin: '0', minBlockSize: '0' }),",
        replace: "Style.nest('&[data-orientation][aria-hidden=\"true\"]', { minBlockSize: '0' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the inset overflows instead of shortening the line',
    edits: [
      {
        file: recipe,
        find: 'inlineSize: `calc(100% - 2 * ${inset})`,',
        replace: "inlineSize: '100%',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the label is pushed to one end',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&[aria-hidden=\"true\"]', { flex: '1 1 0' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the style draws every rule across',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('orientation', orientation)",
        replace: "h.DataAttribute('orientation', 'horizontal')",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a vertical rule shrinks to nothing outside a row',
    edits: [{ file: recipe, find: "minBlockSize: '1em',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a vertical rule in running text sits on the baseline',
    edits: [{ file: recipe, find: "verticalAlign: 'text-bottom',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a vertical rule keeps the horizontal line too',
    edits: [{ file: recipe, find: "borderBlockStart: '0',", replace: '' }],
    tests: browser,
  },
  {
    name: 'the rules of a vertical label keep a line’s height',
    edits: [
      {
        file: recipe,
        find: "{ margin: '0', minBlockSize: '0' }",
        replace: "{ margin: '0' }",
      },
    ],
    tests: browser,
  },
  {
    name: 'a vertical frame lies down',
    edits: [{ file: recipe, find: "flexDirection: 'column',", replace: '' }],
    tests: browser,
  },
]
