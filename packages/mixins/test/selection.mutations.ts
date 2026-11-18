/**
 * Selected text, broken in turn:
 * `pnpm mutate packages/mixins/test/selection.mutations.ts --only "<name>"` checks that a test fails for every one.
 */
const defaults = '../src/defaults.ts'
const palette = '../src/theme/oklch.ts'
const tests = ['packages/mixins/test/selection.browser.test.ts']
const unit = ['packages/mixins/test/selection.test.ts']

export default [
  {
    name: 'the rule goes back inside :where, which a pseudo-element cannot sit in',
    edits: [{ file: defaults, find: '`:where(*)::selection{', replace: '`:where(::selection){' }],
    tests: [...tests, ...unit],
  },
  {
    name: 'the rule ignores the theme’s background token',
    edits: [
      {
        file: defaults,
        find: "background:${v('selection-background', `color-mix(in oklab, ${v('accent-default', 'Highlight')} 28%, transparent)`)}",
        replace:
          "background:color-mix(in oklab, ${v('accent-default', 'Highlight')} 28%, transparent)",
      },
    ],
    tests: [...tests, ...unit],
  },
  {
    name: 'the rule ignores the theme’s ink token',
    edits: [
      { file: defaults, find: ";color:${v('selection-ink', 'currentColor')}}", replace: '}' },
    ],
    tests,
  },
  {
    name: 'the palette’s background is not the accent',
    edits: [
      {
        file: palette,
        find: '`color-mix(in oklab, ${accent} 28%, transparent)`,',
        replace: "`color-mix(in oklab, ${v('text', 'default')} 28%, transparent)`,",
      },
    ],
    tests,
  },
  {
    name: 'the dark background is too faint to stand off the page',
    edits: [
      {
        file: palette,
        find: '`color-mix(in oklab, ${accent} 40%, transparent)`,',
        replace: '`color-mix(in oklab, ${accent} 2%, transparent)`,',
      },
    ],
    tests,
  },
  {
    name: 'the fill’s selection is the fill itself',
    edits: [
      {
        file: palette,
        find: "'fill-background': v('accent', 'active'),",
        replace: "'fill-background': v('accent', 'default'),",
      },
    ],
    tests,
  },
  {
    name: 'the palette’s ink forces a colour on every run',
    edits: [{ file: palette, find: "ink: 'currentColor',", replace: "ink: v('text', 'overt')," }],
    tests: unit,
  },
]
