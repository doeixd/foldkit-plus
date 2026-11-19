/**
 * The site's phone layout, broken in turn: `pnpm mutate examples/site/test/phoneLayout.mutations.ts`.
 */
const file = '../src/style.ts'

export default [
  {
    name: 'a phone row keeps the desktop three columns',
    edits: [
      {
        file,
        find: "        gridTemplateColumns: 'minmax(0, 1fr) auto',\n        paddingBlock: t.space.md,",
        replace:
          "        gridTemplateColumns: 'minmax(9rem, 14rem) minmax(0, 1fr) auto',\n        paddingBlock: t.space.md,",
      },
    ],
    tests: ['examples/site/test/primitiveRows.browser.test.ts'],
  },
  {
    name: 'a primitive says what it is for at the desktop size on a phone',
    edits: [
      {
        file,
        find: "      Style.media(PHONE, { fontSize: '0.9375rem' }),\n    ],\n    primitiveForm: [",
        replace: '    ],\n    primitiveForm: [',
      },
    ],
    tests: ['examples/site/test/primitiveRows.browser.test.ts'],
  },
  {
    name: 'a primitive name stays at the desktop size on a phone',
    edits: [
      {
        file,
        find: "        overflowWrap: 'anywhere',\n      },\n      Style.media(PHONE, { fontSize: '0.9375rem' }),\n    ],\n    primitiveAbout: [",
        replace: "        overflowWrap: 'anywhere',\n      },\n    ],\n    primitiveAbout: [",
      },
    ],
    tests: ['examples/site/test/primitiveRows.browser.test.ts'],
  },
  {
    name: 'a phone row has no padding and no gap to press in',
    edits: [
      {
        file,
        find: '        paddingBlock: t.space.md,\n        rowGap: t.space.xs,\n      }),',
        replace: "        paddingBlock: '0',\n        rowGap: '0',\n      }),",
      },
    ],
    tests: ['examples/site/test/primitiveRows.browser.test.ts'],
  },
]
