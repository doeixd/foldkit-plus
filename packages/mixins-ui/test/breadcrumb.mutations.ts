/**
 * The breadcrumb trail, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/breadcrumb.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/breadcrumb.test.ts']

export default [
  {
    name: 'the current page links onward',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: "? [h.span(builders.current.attrs([h.AriaCurrent('page')]), labelled(step))]",
        replace: '? [h.span(builders.current.attrs(), labelled(step))]',
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
        find: 'if (steps.length <= kept) return',
        replace: 'if (steps.length < kept - 1) return',
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
    name: 'a custom separator leads the first step too',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: 'separator === undefined || index === 0',
        replace: 'separator === undefined',
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
        find: "Style.nest('&:dir(rtl) > li + li::before', { rotate: '135deg' }),",
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
]
