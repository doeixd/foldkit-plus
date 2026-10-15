/**
 * The banner, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/banner.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/banner.test.ts'

export default [
  {
    name: 'the region has no name',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'builders.root.attrs([h.AriaLabel(options.label)])',
        replace: 'builders.root.attrs([])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a link action loses its address',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'builders.action.attrs([h.Href(action.href)])',
        replace: 'builders.action.attrs([])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the action button dismisses',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'h.OnClick(action.onClick)',
        replace: 'h.OnClick(options.onDismiss ?? action.onClick)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the action button submits the form around it',
    edits: [
      {
        file: '../src/banner.ts',
        find: "builders.action.attrs([h.Type('button'), h.OnClick",
        replace: 'builders.action.attrs([h.OnClick',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the dismiss button is named by its glyph',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'h.AriaLabel(options.dismissLabel ?? `Dismiss ${options.label}`),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the dismiss button ignores its own label',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'options.dismissLabel ?? `Dismiss ${options.label}`',
        replace: '`Dismiss ${options.label}`',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the icon is read aloud',
    edits: [
      {
        file: '../src/banner.ts',
        find: 'builders.icon.attrs([h.AriaHidden(true)])',
        replace: 'builders.icon.attrs([])',
      },
    ],
    tests: [unit],
  },
]
