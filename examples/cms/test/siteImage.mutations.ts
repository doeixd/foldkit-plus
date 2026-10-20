/**
 * The site Image's box, broken in turn:
 * `pnpm mutate examples/cms/test/siteImage.mutations.ts` checks that a test
 * fails for every one.
 */
const site = '../src/content/site.ts'
const tests = ['examples/cms/test/siteBlocks.test.ts']

export default [
  {
    name: 'facts of an address edited away still shape the box',
    edits: [{ file: site, find: 'Option.filter(asset => asset.key === props.src),', replace: '' }],
    tests,
  },
  {
    name: 'the facts shape nothing',
    edits: [
      {
        file: site,
        find: "onSome: ratio => [h.Style({ '--image-ratio': ratio })],",
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'the box is the facts turned on their side',
    edits: [{ file: site, find: '`${width} / ${height}`', replace: '`${height} / ${width}`' }],
    tests,
  },
  {
    name: 'the inspector shows the facts',
    edits: [
      {
        file: site,
        find: 'Builder.controls({ asset: Input.hidden() })',
        replace: 'Builder.controls({})',
      },
    ],
    tests,
  },
]
