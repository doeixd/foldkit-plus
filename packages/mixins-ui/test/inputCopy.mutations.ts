/**
 * The input copy, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/inputCopy.mutations.ts` checks that a
 * test fails for every one.
 */
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
]
