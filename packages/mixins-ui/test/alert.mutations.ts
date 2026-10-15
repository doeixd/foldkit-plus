/**
 * The alert, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/alert.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/alert.test.ts']

export default [
  {
    name: 'every inline alert interrupts',
    edits: [
      {
        file: '../src/alert.ts',
        find: "h.Role(assertive === true ? 'alert' : 'status')",
        replace: "h.Role('alert')",
      },
    ],
    tests,
  },
  {
    name: 'a banner is a live region too',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'builders.root.attrs([h.AriaLabel(label), ...marks])',
        replace: "builders.root.attrs([h.AriaLabel(label), h.Role('status'), ...marks])",
      },
    ],
    tests,
  },
  {
    name: 'the banner region has no name',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'builders.root.attrs([h.AriaLabel(label), ...marks])',
        replace: 'builders.root.attrs([...marks])',
      },
    ],
    tests,
  },
  {
    name: 'the root does not say whether it is dismissible',
    edits: [
      {
        file: '../src/alert.ts',
        find: "h.DataAttribute('dismissible', String(onDismiss !== undefined)),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the root does not say its layout',
    edits: [
      {
        file: '../src/alert.ts',
        find: "h.DataAttribute('layout', options.layout),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a link action loses its address',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'builders.action.attrs([h.Href(action.href)])',
        replace: 'builders.action.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'only the first action is drawn',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'actions.map(drawAction)',
        replace: 'actions.slice(0, 1).map(drawAction)',
      },
    ],
    tests,
  },
  {
    name: 'an action button dismisses',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'h.OnClick(action.onClick)',
        replace: 'h.OnClick(options.onDismiss ?? action.onClick)',
      },
    ],
    tests,
  },
  {
    name: 'an action button submits the form around it',
    edits: [
      {
        file: '../src/alert.ts',
        find: "builders.action.attrs([h.Type('button'), h.OnClick",
        replace: 'builders.action.attrs([h.OnClick',
      },
    ],
    tests,
  },
  {
    name: 'the dismiss button is named by its glyph',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'h.AriaLabel(options.dismissLabel ?? `Dismiss ${region.name}`),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the dismiss button ignores its own label',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'options.dismissLabel ?? `Dismiss ${region.name}`',
        replace: '`Dismiss ${region.name}`',
      },
    ],
    tests,
  },
  {
    name: 'an inline dismiss button is named after nothing',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'name: title,',
        replace: "name: '',",
      },
    ],
    tests,
  },
  {
    name: 'the icon is read aloud',
    edits: [
      {
        file: '../src/alert.ts',
        find: 'builders.icon.attrs([h.AriaHidden(true)])',
        replace: 'builders.icon.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'errors read as info',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: "error: { root: toned('error') },",
        replace: "error: { root: toned('info') },",
      },
    ],
    tests,
  },
  {
    name: 'bold is a tint',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: "background: 'var(--_fk-alert-fill)',",
        replace: "background: 'var(--_fk-alert-subtle)',",
      },
    ],
    tests,
  },
  {
    name: 'a banner keeps room for a dismiss button it does not have',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: 'Style.pseudo(`${banner}[data-dismissible="true"]`, { paddingInline: corner }),',
        replace: 'Style.pseudo(banner, { paddingInline: corner }),',
      },
    ],
    tests,
  },
]
