/**
 * Set type, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/typography.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/typography.test.ts']

export default [
  {
    name: 'headings all read as h1',
    edits: [
      {
        file: '../src/typography.ts',
        find: "    case 'h2':\n      return h.h2(attrs, says)",
        replace: "    case 'h2':\n      return h.h1(attrs, says)",
      },
    ],
    tests,
  },
  {
    name: 'muted text reads overt',
    edits: [
      {
        file: '../src/recipes/typography.ts',
        find: 'muted: { fontSize: ref.size.sm, color: ref.text.muted },',
        replace: 'muted: { fontSize: ref.size.sm, color: ref.text.overt },',
      },
    ],
    tests,
  },
  {
    name: 'the display role loses its fluid growth',
    edits: [
      {
        file: '../src/recipes/typography.ts',
        find: "...role('display', { fluid: true }),",
        replace: "...role('display'),",
      },
    ],
    tests,
  },
  {
    name: 'the view does not write its level',
    edits: [
      {
        file: '../src/typography.ts',
        find: "builders.text.attrs([h.DataAttribute('level', options.level)])",
        replace: 'builders.text.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'content is drawn as the text',
    edits: [
      {
        file: '../src/typography.ts',
        find: 'const says = options.content ?? [options.text]',
        replace: 'const says = [options.text ?? ""]',
      },
    ],
    tests,
  },
  {
    name: 'the body is not held to the measure',
    edits: [
      {
        file: '../src/recipes/typography.ts',
        find: 'body: { maxInlineSize: ref.reading.measure },',
        replace: 'body: {},',
      },
    ],
    tests,
  },
]
