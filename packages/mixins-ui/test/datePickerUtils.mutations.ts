/**
 * The vendored date-picker utils, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/datePickerUtils.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/datePickerUtils.test.ts']

export default [
  {
    name: 'ids need no prefix',
    edits: [
      {
        file: '../src/datePickerUtils.ts',
        find: 'export const idSelector = (id: string): string => `#${escapeCssIdentifier(id)}`',
        replace: 'export const idSelector = (id: string): string => `${escapeCssIdentifier(id)}`',
      },
    ],
    tests,
  },
  {
    name: 'everything is a valid identifier',
    edits: [
      {
        file: '../src/datePickerUtils.ts',
        find: 'const isIdentifierCode = (code: number): boolean =>\n  code >= FIRST_NON_ASCII_CODE ||',
        replace: 'const isIdentifierCode = (code: number): boolean =>\n  true ||',
      },
    ],
    tests,
  },
  {
    name: 'attribute values need no quotes',
    edits: [
      {
        file: '../src/datePickerUtils.ts',
        find: 'string =>\n  `[${attribute}="${escapeCssIdentifier(value)}"]`',
        replace: 'string =>\n  `[${attribute}=${escapeCssIdentifier(value)}]`',
      },
    ],
    tests,
  },
]
