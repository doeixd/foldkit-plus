/**
 * Themes installed by name, broken in turn:
 * `pnpm mutate packages/mixins/test/themes.mutations.ts`.
 */
const browser = ['packages/mixins/test/themes.browser.test.ts']
const unit = ['packages/mixins/test/knobs.test.ts']
const file = '../src/theme/themes.ts'

export default [
  {
    name: 'a scoped theme declares no derivations',
    edits: [
      {
        file,
        find: 'return global(`${selector}{${declarations(derived)}}${knobRule(selector, theme)}`)',
        replace: 'return global(knobRule(selector, theme))',
      },
    ],
    tests: browser,
  },
  {
    name: 'no other theme is drawn under its name',
    edits: [
      { file, find: '.filter(name => name !== options.initial)', replace: '.filter(() => false)' },
    ],
    tests: [...browser, ...unit],
  },
  {
    name: 'the initial theme keeps an attribute of its own',
    edits: [
      {
        file,
        find: 'if (name === themes.initial) root.removeAttribute(themes.attribute)\n    else ',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the root declares the first theme, not the initial one',
    edits: [
      {
        file,
        find: 'palette: compose(palette, tokensOf(theme(options.initial))),',
        replace: 'palette: compose(palette, tokensOf(theme(names[0]!))),',
      },
    ],
    tests: unit,
  },
]
