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
]
