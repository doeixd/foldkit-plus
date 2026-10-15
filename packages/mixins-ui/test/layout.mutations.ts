/**
 * The dialog, slider and popup recipes' layout and state, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/layout.mutations.ts`.
 */
export default [
  {
    name: 'the open dialog leaves its panel at the top',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: "      Style.nest('&[open]', { display: 'grid', placeItems: 'center' }),\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/dialog.browser.test.ts'],
  },
  {
    name: 'a centered slider shrinks to its label',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: ", minInlineSize: '12rem' }",
        replace: ' }',
      },
    ],
    tests: ['packages/mixins-ui/test/slider.browser.test.ts'],
  },
  {
    name: 'the active popup row looks like any other',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: '  Style.nest(`${unlit}[data-active]`, lighted),\n',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/popup.browser.test.ts'],
  },
  {
    name: 'the focused popup panel draws a ring',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "  Style.pseudo(':focus-visible', { outline: 'none' }),\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/popup.browser.test.ts'],
  },
  {
    name: 'the panel ignores its theme',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: 'color-mix(in oklab, ${ref.popup.inverted} calc(',
        replace: 'color-mix(in oklab, ${ref.surface.base} calc(',
      },
    ],
    tests: ['packages/mixins-ui/test/popup.browser.test.ts'],
  },
  {
    name: 'a row keeps the page text on an inverted panel',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "    color: 'inherit',",
        replace: '    color: ref.text.default,',
      },
    ],
    tests: ['packages/mixins-ui/test/popup.browser.test.ts'],
  },
  {
    name: 'a lit row ignores a bold menu accent',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "const lighted = { background: ref.popup.highlight, color: ref.popup['highlight-ink'] }",
        replace:
          "const lighted = { background: 'color-mix(in oklab, currentColor 8%, transparent)' }",
      },
    ],
    tests: ['packages/mixins-ui/test/popup.browser.test.ts'],
  },
]
