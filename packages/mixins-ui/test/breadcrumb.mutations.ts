/**
 * The breadcrumb trail, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/breadcrumb.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/breadcrumb.test.ts']

// `breadcrumb.imports.test.ts` reads the source from disk, which no mutation reaches; it was
// shown red by hand: `import { type ItemRow } from './menu.js'` in `../src/breadcrumb.ts`.
const menu = 'packages/mixins-ui/test/breadcrumbMenu.browser.test.ts'

export default [
  {
    name: 'the landmark ignores the name given',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'h.AriaLabel(text.label)',
        replace: "h.AriaLabel('Breadcrumb')",
      },
    ],
    tests: ['packages/mixins-ui/test/breadcrumb.test.ts'],
  },
  {
    name: 'the current page links onward',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: "builders.current.attrs([h.AriaCurrent('page'), ...name])",
        replace: 'builders.current.attrs([...name])',
      },
    ],
    tests,
  },
  {
    name: 'dividers go missing',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: 'slash: separatorOf({ content: \'"/"\' }),',
        replace: 'slash: separatorOf({ content: \'""\' }),',
      },
    ],
    tests,
  },
  {
    name: 'a collapsed trail keeps one step too few at the end',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'after: steps.slice(steps.length - (kept - 1)),',
        replace: 'after: steps.slice(steps.length - (kept - 2)),',
      },
    ],
    tests,
  },
  {
    name: 'a trail of one step fewer than the most still folds',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'steps.length <= kept) return',
        replace: 'steps.length < kept - 1) return',
      },
    ],
    tests,
  },
  {
    name: 'the ellipsis expands nothing',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'h.OnClick(collapse.onExpand),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the icon is read beside the label',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: ': [h.span(builders.icon.attrs([h.AriaHidden(true)]), [step.icon])]),',
        replace: ': [h.span(builders.icon.attrs(), [step.icon])]),',
      },
    ],
    tests,
  },
  {
    name: 'a custom separator follows the first step instead of the last',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'separator === undefined || index === total - 1',
        replace: 'separator === undefined || index === 0',
      },
    ],
    tests,
  },
  {
    name: 'the drawn divider stays beside a custom one',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: "{ content: 'none' }",
        replace: "{ content: 'normal' }",
      },
    ],
    tests,
  },
  {
    name: 'the chevron points the same way right to left',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: "Style.nest('&:dir(rtl) > li:not(:last-child)::after', { rotate: '135deg' }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the separator keeps a margin of its own after it',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: 'Style.nest(between, { color: ref.text.muted }),',
        replace: 'Style.nest(between, { marginInlineEnd: ref.space.xs, color: ref.text.muted }),',
      },
    ],
    tests: ['packages/mixins-ui/test/breadcrumb.browser.test.ts'],
  },
  {
    name: 'a maximum of NaN folds the trail into itself',
    edits: [{ file: '../src/breadcrumb.ts', find: 'Number.isNaN(kept) || ', replace: '' }],
    tests,
  },
  {
    name: 'the Menu holds every step',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'hiddenRows(collapsedOf(steps, max).hidden)',
        replace: 'hiddenRows(steps)',
      },
    ],
    tests,
  },
  {
    name: 'a chosen row stands for no step',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'hidden[Number(value)]',
        replace: 'hidden[Number(value) + 1]',
      },
    ],
    tests: [...tests, menu],
  },
  {
    name: 'the Menu draws no rows',
    edits: [
      {
        file: '../src/breadcrumb/menu.ts',
        find: 'rows: hiddenRows(hidden),',
        replace: 'rows: [],',
      },
    ],
    tests: [menu],
  },
  {
    name: "the Menu's trigger goes unnamed",
    edits: [
      {
        file: '../src/breadcrumb/menu.ts',
        find: 'attributes: () => builders.ellipsis.attrs([h.AriaLabel(label)]),',
        replace: 'attributes: () => builders.ellipsis.attrs(),',
      },
    ],
    tests: [menu],
  },
  {
    name: 'the ellipsis name ignores the count of hidden steps',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'fill(text.more, { count: hidden.length })',
        replace: 'text.more',
      },
    ],
    tests,
  },
  {
    name: 'the ellipsis ignores its word',
    edits: [{ file: '../src/breadcrumb.ts', find: '[text.ellipsis],', replace: "['…']," }],
    tests,
  },
  {
    name: 'a feature is never handed the hidden steps',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: '{ label, ellipsis: text.ellipsis, hidden, builders }',
        replace: '{ label, ellipsis: text.ellipsis, hidden: [], builders }',
      },
    ],
    tests,
  },
  {
    name: 'a step draws no trailing content',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: '...(step.trailing === undefined ? [] : [',
        replace: '...(true ? [] : [',
      },
    ],
    tests,
  },
  {
    name: "a hidden label is not the step's name",
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'const name = step.labelHidden === true ? [h.AriaLabel(step.label)] : []',
        replace: 'const name: ReadonlyArray<never> = []',
      },
    ],
    tests,
  },
  {
    name: 'a hidden label is drawn anyway',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: '...(step.labelHidden === true ? [] : [step.label]),',
        replace: 'step.label,',
      },
    ],
    tests,
  },
  {
    name: 'a pill has no corner',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: '  paddingInline: ref.space.sm,\n  borderRadius: ref.radius.full,\n',
        replace: '  paddingInline: ref.space.sm,\n',
      },
    ],
    tests,
  },
  {
    name: 'the last step is followed by a separator',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'index === total - 1',
        replace: 'index === total',
      },
    ],
    tests,
  },
  {
    name: 'a link drawn as the ellipsis is underlined',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: "        // A fold of your own may draw a link, which the browser underlines.\n        textDecoration: 'none',\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "the ellipsis loses to the Menu style's trigger",
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: 'ellipsis: variant(',
        replace: 'ellipsis: component(',
      },
    ],
    tests: [menu],
  },
]
