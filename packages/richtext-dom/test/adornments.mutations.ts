/**
 * Adornment, the block Messages and placed slash entries, each step broken in turn: `pnpm mutate
 * packages/richtext-dom/test/adornments.mutations.ts` checks that a test fails for every one.
 */
const adornment = ['packages/richtext-dom/test/adornments.test.ts']
const bundle = ['packages/richtext-dom/test/editor-bundle.test.ts']

export default [
  {
    name: 'mount draws no adornments',
    edits: [
      {
        file: '../src/index.ts',
        find: "for (const adornment of block.type === 'Unknown' ? [] : (entry.adornments ?? []))",
        replace: 'for (const adornment of [] as ReadonlyArray<RichText.Adornment>)',
      },
    ],
    tests: adornment,
  },
  {
    name: 'an adornment is editable',
    edits: [
      {
        file: '../src/index.ts',
        find: "element.setAttribute('contenteditable', 'false')\n  if (adornment.text",
        replace: 'if (adornment.text',
      },
    ],
    tests: adornment,
  },
  {
    name: 'an adornment counts as text',
    edits: [
      {
        file: '../src/index.ts',
        find: "    : isAdornment(node)\n      ? ''\n      : Array",
        replace: "    : false\n      ? ''\n      : Array",
      },
    ],
    tests: adornment,
  },
  {
    name: 'a caret beside an adornment reads only its nearest sibling',
    edits: [
      {
        file: '../src/index.ts',
        find: 'for (let at = offset; at < node.childNodes.length; at++) {',
        replace: 'for (let at = offset; at < Math.min(offset + 1, node.childNodes.length); at++) {',
      },
    ],
    tests: adornment,
  },
  {
    name: 'server markup draws no adornments',
    edits: [
      {
        file: '../src/view.ts',
        find: 'const adornment = renderAdornment(element, true)',
        replace: 'const adornment: ReadonlyArray<Html> = []',
      },
    ],
    tests: adornment,
  },
  {
    name: 'an import keeps adornments',
    edits: [
      { file: '../src/html.ts', find: '    adornment.remove()', replace: '    void adornment' },
    ],
    tests: adornment,
  },
  {
    name: 'a click sets the prop it found',
    edits: [
      {
        file: '../src/events.ts',
        find: 'props: { [prop]: block.props[prop] !== true }',
        replace: 'props: { [prop]: block.props[prop] === true }',
      },
    ],
    tests: adornment,
  },
  {
    name: 'a click lets the browser change the box',
    edits: [
      {
        file: '../src/events.ts',
        find: "    if (block?.type !== 'Node') return\n    event.preventDefault()",
        replace: "    if (block?.type !== 'Node') return",
      },
    ],
    tests: adornment,
  },
  {
    name: 'a click anywhere toggles',
    edits: [
      {
        file: '../src/events.ts',
        find: 'const adornment = origin.closest(`[${RichText.TOGGLES_ATTRIBUTE}]`)',
        replace: "const adornment = origin.closest('[data-block] > *')",
      },
      {
        file: '../src/events.ts',
        find: 'const prop = adornment.getAttribute(RichText.TOGGLES_ATTRIBUTE)!',
        replace: "const prop = adornment.getAttribute(RichText.TOGGLES_ATTRIBUTE) ?? 'done'",
      },
    ],
    tests: adornment,
  },
  {
    name: 'a placement’s slash entries are ignored',
    edits: [
      {
        file: '../src/editor-bundle.ts',
        find: 'slashEntriesFor(model.hostId) ?? slashEntries,',
        replace: 'slashEntries,',
      },
    ],
    tests: bundle,
  },
]
