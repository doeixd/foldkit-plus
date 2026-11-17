/**
 * A lit row's ink, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupContrast.mutations.ts` checks that a
 * test fails for every one.
 */
const knobs = '../../mixins/src/theme/knobs.ts'
const popup = '../src/recipes/popup.ts'
const command = '../src/recipes/command.ts'
const tests = ['packages/mixins-ui/test/popupContrast.browser.test.ts']

export default [
  {
    name: 'a menu takes the inverted panel by default again',
    edits: [
      {
        file: knobs,
        find: "      title: 'Menu color',\n      default: 'default',",
        replace: "      title: 'Menu color',\n      default: 'inverted',",
      },
    ],
    tests,
  },
  {
    name: 'the inline Command row reads the global popup ink again',
    edits: [
      {
        file: command,
        find: "        background: ref.popup['plain-highlight'],\n        color: ref.popup['plain-highlight-ink'],",
        replace:
          "        background: ref.popup.highlight,\n        color: ref.popup['highlight-ink'],",
      },
    ],
    tests,
  },
  {
    name: 'a panel row falls back to a plain surface instead of the panel',
    edits: [
      {
        file: popup,
        find: "    '--_fk-row-highlight-ink': ref.popup['highlight-ink'],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a panel declares no row colours at all',
    edits: [
      {
        file: popup,
        find: "    '--_fk-row-highlight': ref.popup.highlight,\n    '--_fk-row-press': ref.popup.press,\n    '--_fk-row-highlight-ink': ref.popup['highlight-ink'],\n",
        replace: '',
      },
    ],
    tests,
  },
]
