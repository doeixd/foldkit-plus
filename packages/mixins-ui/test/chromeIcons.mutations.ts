/**
 * The components' own icons, read from the theme's `icon` tokens, each swapped
 * for another in turn: `pnpm mutate packages/mixins-ui/test/chromeIcons.mutations.ts`
 * checks that a test tells them apart.
 */
const at = (component: string) => `../src/recipes/${component}.ts`
const tests = (component: string) => [
  'packages/mixins-ui/test/chromeIcons.test.ts',
  `packages/mixins-ui/test/${component}.test.ts`,
  `packages/mixins-ui/test/${component}.browser.test.ts`,
]

export default [
  {
    name: 'a shown password is drawn as a hidden one',
    edits: [
      {
        file: at('passwordInput'),
        find: "true: ref.icon['eye-off']",
        replace: 'true: ref.icon.eye',
      },
    ],
    tests: tests('passwordInput'),
  },
  {
    name: 'the eyedropper is drawn as a magnifier',
    edits: [
      { file: at('colorPicker'), find: '${ref.icon.pipette}', replace: '${ref.icon.search}' },
    ],
    tests: tests('colorPicker'),
  },
  {
    name: 'a left turn is drawn as a right one',
    edits: [
      {
        file: at('imageCropper'),
        find: "${ref.icon['rotate-ccw']}",
        replace: "${ref.icon['rotate-cw']}",
      },
    ],
    tests: tests('imageCropper'),
  },
  {
    name: 'a success is marked as an error',
    edits: [
      {
        file: at('toast'),
        find: 'success: ref.icon.success,',
        replace: 'success: ref.icon.error,',
      },
    ],
    tests: tests('toast'),
  },
  {
    name: 'a toast closes under a lock',
    edits: [
      { file: at('toast'), find: 'close: ref.icon.close,', replace: 'close: ref.icon.lock,' },
    ],
    tests: tests('toast'),
  },
]
