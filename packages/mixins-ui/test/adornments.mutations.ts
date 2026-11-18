/**
 * The adornments of a text field and Input's variants, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/adornments.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/adornments.test.ts']
const browser = ['packages/mixins-ui/test/adornments.browser.test.ts']
const recipe = '../src/recipes/field.ts'

export default [
  {
    name: 'an adorned field draws no group',
    edits: [
      {
        file: '../src/adornments.ts',
        find: 'if (adornments.start === undefined && adornments.end === undefined) return control',
        replace: 'return control',
      },
    ],
    tests: unit,
  },
  {
    name: 'the group carries no mark',
    edits: [
      {
        file: '../src/adornments.ts',
        find: "[...attributes.group, h.DataAttribute(GROUP_MARK, '')]",
        replace: '[...attributes.group]',
      },
    ],
    tests: unit,
  },
  {
    name: 'a description is not linked to the input',
    edits: [
      {
        file: '../src/input.ts',
        find: '? { hasDescription: options.description !== undefined }',
        replace: '? { hasDescription: false }',
      },
    ],
    tests: unit,
  },
  {
    name: 'the control inside a group keeps its border',
    edits: [
      {
        file: recipe,
        find: "    flex: '1',\n    minInlineSize: '0',\n    border: '0',",
        replace: "    flex: '1',\n    minInlineSize: '0',\n    border: '1px solid red',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a disabled group does not dim',
    edits: [
      {
        file: recipe,
        find: "const adornedGroup: StyleValue = Style.compose(\n  fieldBox({ display: 'flex', alignItems: 'center' }),\n  component(\n    Style.pseudo(':has(:disabled)', { opacity: ref.knob['state-disabled'],",
        replace:
          "const adornedGroup: StyleValue = Style.compose(\n  fieldBox({ display: 'flex', alignItems: 'center' }),\n  component(\n    Style.pseudo(':has(:disabled)', { opacity: '1',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the underline draws no bottom edge',
    edits: [
      {
        file: recipe,
        find: '    borderBlockEndColor: ref.outline.default,\n  }),',
        replace: "    borderBlockEndColor: 'transparent',\n  }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a ghost shows no hover',
    edits: [
      {
        file: recipe,
        find: '{ backgroundColor: unfilledHover }),\n  Style.pseudo(\'[aria-invalid="true"]\', { borderColor',
        replace:
          "{ backgroundColor: 'transparent' }),\n  Style.pseudo('[aria-invalid=\"true\"]', { borderColor",
      },
    ],
    tests: browser,
  },
]
