/**
 * A render's `styles` kept through hydration (#365), broken in turn: `pnpm
 * mutate packages/ssr/test/styles.mutations.ts` checks that a test fails for
 * each.
 */
const client = '../src/client.ts'
const index = '../src/index.ts'
const styles = ['packages/ssr/test/styles.test.ts']

export default [
  {
    name: 'the styles are left in the root for hydration to remove',
    edits: [{ file: client, find: '    keepStyles(root)\n', replace: '' }],
    tests: styles,
  },
  {
    name: 'the server writes no marker before the styles',
    edits: [
      {
        file: index,
        find: '`<!--${STYLES_MARKER}-->${extra}`',
        replace: '`${extra}`',
      },
    ],
    tests: styles,
  },
  {
    name: 'the marker stays in the root',
    edits: [{ file: client, find: '  marker.remove()\n}', replace: '}' }],
    tests: styles,
  },
  {
    name: 'only a page that resumes keeps its styles',
    edits: [
      { file: client, find: '    keepStyles(root)\n', replace: '' },
      {
        file: client,
        find: '  const adoptFrom = (model: Model): void => {\n',
        replace: '  const adoptFrom = (model: Model): void => {\n    keepStyles(root)\n',
      },
    ],
    tests: styles,
  },
  {
    name: 'the render collects no drawn classes',
    edits: [{ file: index, find: '    global[DRAWN_CLASSES] = drawn\n', replace: '' }],
    tests: styles,
  },
]
