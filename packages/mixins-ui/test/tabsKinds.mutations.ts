/**
 * Closable, vertical and scrolling tabs, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tabsKinds.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/tabsKinds.browser.test.ts']
const unit = ['packages/mixins-ui/test/tabs.test.ts']
const adapter = '../src/tabs.ts'
const recipe = '../src/recipes/tabs.ts'

export default [
  {
    name: 'Delete closes nothing',
    edits: [{ file: adapter, find: "key === 'Delete'", replace: "key === 'Del'" }],
    tests,
  },
  {
    name: 'the close button sends nothing',
    edits: [
      {
        file: adapter,
        find: '          h.OnClick(onClose(item.value)),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'focus goes to the first tab after a close',
    edits: [
      {
        file: adapter,
        find: 'focus: Option.map(next, () => Math.min(at, left.length - 1)),',
        replace: 'focus: Option.map(next, () => 0),',
      },
    ],
    tests: [...tests, ...unit],
  },
  {
    name: 'closing the chosen tab chooses the one before it',
    edits: [
      {
        file: adapter,
        find: 'const next = Option.fromNullishOr(left[Math.min(at, left.length - 1)])',
        replace: 'const next = Option.fromNullishOr(left[Math.max(0, at - 1)])',
      },
    ],
    tests: [...tests, ...unit],
  },
  {
    name: "a closable tab's item passes for a tablist without the Mount",
    edits: [
      {
        file: recipe,
        find: '`:where(${tablist}) > &${selected}, :where(${tablist}) > * > &${selected}`',
        replace: '`:where(:not([data-fluid-hover])) > &${selected}`',
      },
    ],
    tests,
  },
  {
    name: 'no room for the close button',
    edits: [
      {
        file: recipe,
        find: "paddingInlineEnd: `calc(${ladder('pad')} + ${ladder('icon')} + ${ladder('gap')})`,",
        replace: "paddingInlineEnd: ladder('pad'),",
      },
    ],
    tests,
  },
  {
    name: 'an upright underline stands at the start',
    edits: [
      {
        file: recipe,
        find: "translate: `calc(${chosen('x')} + ${chosen('w')} - ${ref.border.thick}) ${chosen('y')}`,",
        replace: "translate: `${chosen('x')} ${chosen('y')}`,",
      },
    ],
    tests,
  },
  {
    name: 'an upright underline right to left stays on the right',
    edits: [
      {
        file: recipe,
        find: "Style.nest(`${verticalRtl} > &`, { translate: `${chosen('x')} ${chosen('y')}` }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'upright tabs stand in a row',
    edits: [
      {
        file: recipe,
        find: "flexDirection: 'column',",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a long row overflows instead of scrolling',
    edits: [{ file: recipe, find: "overflowX: 'auto',", replace: '' }],
    tests,
  },
]
