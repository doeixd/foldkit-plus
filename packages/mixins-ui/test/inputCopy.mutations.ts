/**
 * The input copy, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/inputCopy.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = 'packages/mixins-ui/test/inputCopy.browser.test.ts'
const unit = 'packages/mixins-ui/test/inputCopy.test.ts'

export default [
  {
    name: 'the field can be edited',
    edits: [{ file: '../src/inputCopy.ts', find: "h.Attribute('readonly', ''),", replace: '' }],
    tests: [unit],
  },
  {
    name: 'the button does not say what it copies',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'h.AriaLabelledBy(`${buttonId} ${labelId}`),',
        replace: 'h.AriaLabelledBy(buttonId),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the button sends nothing',
    edits: [{ file: '../src/inputCopy.ts', find: 'h.OnClick(options.onCopy),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the button keeps saying Copy once copied',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: "[options.copied ? copiedLabel : (options.copyLabel ?? 'Copy')]",
        replace: "[options.copyLabel ?? 'Copy']",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the status region appears only as it speaks',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: "h.span(builders.status.attrs([h.Role('status')]), options.copied ? [copiedLabel] : []),",
        replace:
          "...(options.copied ? [h.span(builders.status.attrs([h.Role('status')]), [copiedLabel])] : []),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the status region says nothing',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'options.copied ? [copiedLabel] : []),',
        replace: '[]),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Copy writes an empty clipboard',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'copyText(text).effect',
        replace: "copyText('').effect",
      },
    ],
    tests: [unit],
  },
  {
    name: "an earlier copy's reset cuts a later copy short",
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'copy === model.copies && model.copied',
        replace: 'model.copied',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Reset does not wait',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'Effect.sleep(Duration.millis(ms))',
        replace: 'Effect.sleep(Duration.millis(0))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Copied begins no Reset',
    edits: [
      {
        file: '../src/inputCopy.ts',
        find: 'commands: [Reset({ ms: model.resetAfter, copy: copies })],',
        replace: 'commands: [],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input and the button keep the group corner',
    edits: [
      {
        file: '../src/recipes/inputCopy.ts',
        find: 'const inner = nested()',
        replace: 'const inner = ref.radius.md',
      },
    ],
    tests: [browser],
  },
  {
    // What the review's regex let through: a radius off by a factor, still a calc.
    name: 'the input and the button round three times too far',
    edits: [
      {
        file: '../src/recipes/inputCopy.ts',
        find: 'const inner = nested()',
        replace: 'const inner = `calc(${nested()} * 3)`',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the group publishes its outer corner, not the one inside its border',
    edits: [
      {
        file: '../src/recipes/inputCopy.ts',
        find: "...nests(controlCorner, '0px', ref.border.thin),",
        replace: "...nests(controlCorner, '0px'),",
      },
    ],
    tests: [browser],
  },
]
