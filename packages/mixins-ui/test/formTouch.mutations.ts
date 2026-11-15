/**
 * The touch floor on form controls, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/formTouch.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/formTouch.touch.browser.test.ts']
const recipe = (name: string) => `../src/recipes/${name}.ts`

export default [
  {
    name: 'the number field is a bare rung tall',
    edits: [
      {
        file: recipe('numberField'),
        find: 'minBlockSize: controlHeight,',
        replace: "minBlockSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'a stepper is a bare rung wide',
    edits: [
      {
        file: recipe('numberField'),
        find: 'inlineSize: controlHeight,',
        replace: "inlineSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'an otp cell is a bare rung',
    edits: [
      {
        file: recipe('otpField'),
        find: 'blockSize: controlHeight,',
        replace: "blockSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'the copy field is a bare rung tall',
    edits: [
      {
        file: recipe('inputCopy'),
        find: 'minBlockSize: controlHeight,',
        replace: "minBlockSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'the tags field is a bare rung tall',
    edits: [
      {
        file: recipe('tagsInput'),
        find: 'minBlockSize: controlHeight,',
        replace: "minBlockSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'the password toggle is a bare rung wide',
    edits: [
      {
        file: recipe('passwordInput'),
        find: 'inlineSize: controlHeight,',
        replace: "inlineSize: ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'the segmented tray is a bare rung tall',
    edits: [
      {
        file: recipe('segmented'),
        find: 'const optionHeight = `calc(${controlHeight}',
        replace: "const optionHeight = `calc(${ladder('height')}",
      },
    ],
    tests,
  },
]
