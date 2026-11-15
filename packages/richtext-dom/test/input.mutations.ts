/**
 * `richTextInput`'s codec, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/input.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/input.ts'
const tests = ['packages/richtext-dom/test/input.test.ts']

export default [
  {
    name: 'the codec reads a blank document',
    edits: [
      {
        file,
        find: 'RichText.isBlank(model.document) ? codec.blank : codec.value(model.document)',
        replace: 'codec.value(model.document)',
      },
    ],
    tests,
  },
  {
    name: 'a blank document reads as no value although the codec gives one',
    edits: [{ file, find: '? codec.blank : codec.value', replace: '? undefined : codec.value' }],
    tests,
  },
  {
    name: 'a given value is shown without its codec',
    edits: [{ file, find: 'document: codec.fill(value),', replace: 'document: value,' }],
    tests,
  },
  {
    name: 'the key reads the document, not the codec’s value',
    edits: [{ file, find: ': codec.value(model.document)', replace: ': model.document' }],
    tests,
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
