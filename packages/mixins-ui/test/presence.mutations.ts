/**
 * Entrances and exits, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/presence.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/presence.browser.test.ts']
const design = '../src/recipes/design.ts'

export default [
  {
    name: 'a leave replays the entrance',
    edits: [
      {
        file: design,
        find: "    Style.pseudo('[data-leave]', timing(ref.motion[`${tier}-exit`], ref.motion['ease-exit'])),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a closed surface is still there',
    edits: [
      {
        file: design,
        find: "Style.pseudo('[data-closed]', { opacity: '0', ...closed }),",
        replace: "Style.pseudo('[data-closed]', closed),",
      },
    ],
    tests,
  },
  {
    name: 'a popup above its trigger still drops from the top',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "  Style.pseudo('[data-placement=\"top\"][data-closed]', { translate: '0 4px' }),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a tooltip above its trigger slides from the wrong side',
    edits: [
      {
        file: '../src/recipes/tooltip.ts',
        find: "Style.pseudo('[data-placement=\"top\"][data-closed]', { translate: '0 4px' }),",
        replace: 'Style.pseudo(\'[data-placement="top"][data-closed]\', {}),',
      },
    ],
    tests,
  },
  {
    name: 'a dialog keeps its width in a compact region',
    edits: [
      { file: '../src/recipes/dialog.ts', find: '(1 - 0.1 * ${ref.knob.step})', replace: '1' },
    ],
    tests,
  },
  {
    name: 'an icon with no size ignores the ladder',
    edits: [
      {
        file: '../src/recipes/icon.ts',
        find: "        inlineSize: ladder('icon'),\n        blockSize: ladder('icon'),",
        replace: "        inlineSize: '1rem',\n        blockSize: '1rem',",
      },
    ],
    tests: ['packages/mixins-ui/test/ladder.browser.test.ts'],
  },
]
