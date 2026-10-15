/**
 * The link editor, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/link.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/link.ts'
const tests = ['packages/mixins-richtext/test/link.test.ts']

export default [
  {
    name: 'Enter applies the drawn draft though the caller resolves it',
    edits: [
      {
        file,
        find: 'if (input.submitted !== undefined) return Option.some(input.submitted)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Escape does nothing',
    edits: [
      {
        file,
        find: "if (key === 'Escape' && input.closed !== undefined) return Option.some(input.closed)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a caret outside a link is linked',
    edits: [
      {
        file,
        find: 'if (RichText.linkAt(document, selection) === undefined && !RichText.coversText(selection)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'any address is sent',
    edits: [
      {
        file,
        find: 'const href = RichText.safeUrl(draft)',
        replace: 'const href = draft as string | undefined',
      },
    ],
    tests,
  },
]
